"""Motor de Decisao Juridica.

Combina as saidas dos Modelos A (P(L)) e B (Vc) numa formula financeira
para decidir ACORDO vs DEFESA e sugerir valor de acordo.

Formulas:
    E[C_defesa] = P(L) * Vc + Cp
    Decisao = ACORDO se E[C_defesa] > Limiar, senao DEFESA
    V_acordo = alpha * E[C_defesa]

Parametros alpha, Limiar e Cp NAO sao valores arbitrarios em config -
sao derivados automaticamente do backtesting sobre a base historica.

Features documentais (do extrator de PDFs) entram como overrides
deterministicos de borda, nao como multiplicadores calibrados.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Optional

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from . import config as cfg
from . import features as feat


class Decisao(str, Enum):
    ACORDO = "ACORDO"
    DEFESA = "DEFESA"


class RazaoOverride(str, Enum):
    NENHUMA = "NENHUMA"
    DOCUMENTACAO_COMPLETA_SEM_FRAUDE = "DOCUMENTACAO_COMPLETA_SEM_FRAUDE"
    FRAUDE_CONFIRMADA_SEM_CONTRATO = "FRAUDE_CONFIRMADA_SEM_CONTRATO"
    IFP_FORTE = "IFP_FORTE"
    IFP_FRACO = "IFP_FRACO"


@dataclass
class ResultadoDecisao:
    decisao: Decisao
    probabilidade_perda: float
    valor_condenacao_estimado: float
    valor_condenacao_faixa: tuple[float, float]
    custo_processual: float
    custo_esperado_defesa: float
    valor_acordo_sugerido: Optional[float]
    alpha_aplicado: float
    limiar_aplicado: float
    policy: str
    override_aplicado: bool
    razao_override: RazaoOverride
    explicacao: str
    features_entrada: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["decisao"] = self.decisao.value
        d["razao_override"] = self.razao_override.value
        return d


def aplicar_overrides_documentais(
    features_doc: Optional[dict],
) -> tuple[Optional[Decisao], RazaoOverride]:
    """Regras binarias de borda. Retorna (None, NENHUMA) na zona cinza.

    Ordem de prioridade:
      1. IFP (sinal agregado mais forte) - se >= ALTO ou <= BAIXO, decide
      2. Regras legadas baseadas em flags individuais (contrato+TED+laudo+score_fraude)
    """
    if not features_doc:
        return None, RazaoOverride.NENHUMA

    ifp = features_doc.get("ifp")
    if ifp is not None:
        ifp_f = float(ifp)
        if ifp_f >= cfg.OVERRIDE_IFP_ALTO:
            return Decisao.DEFESA, RazaoOverride.IFP_FORTE
        if ifp_f <= cfg.OVERRIDE_IFP_BAIXO:
            return Decisao.ACORDO, RazaoOverride.IFP_FRACO

    tem_contrato = bool(features_doc.get("tem_contrato_assinado", False))
    tem_ted = bool(features_doc.get("tem_comprovante_ted", False))
    laudo_favoravel = bool(features_doc.get("laudo_favoravel", False))
    score_fraude = float(features_doc.get("score_fraude", 0.5))

    if (
        tem_contrato
        and tem_ted
        and laudo_favoravel
        and score_fraude < cfg.OVERRIDE_SCORE_FRAUDE_BAIXO
    ):
        return Decisao.DEFESA, RazaoOverride.DOCUMENTACAO_COMPLETA_SEM_FRAUDE

    if score_fraude > cfg.OVERRIDE_SCORE_FRAUDE_ALTO and not tem_contrato:
        return Decisao.ACORDO, RazaoOverride.FRAUDE_CONFIRMADA_SEM_CONTRATO

    return None, RazaoOverride.NENHUMA


def _explicar(resultado: ResultadoDecisao) -> str:
    base = (
        f"Decisao: {resultado.decisao.value}. "
        f"Probabilidade de perda prevista: {resultado.probabilidade_perda:.1%}. "
        f"Condenacao estimada (se perder): R$ {resultado.valor_condenacao_estimado:,.2f} "
        f"(faixa IC 80%: R$ {resultado.valor_condenacao_faixa[0]:,.2f} a "
        f"R$ {resultado.valor_condenacao_faixa[1]:,.2f}). "
        f"Custo esperado da defesa: R$ {resultado.custo_esperado_defesa:,.2f}. "
    )
    if resultado.override_aplicado:
        if resultado.razao_override == RazaoOverride.IFP_FORTE:
            ifp_val = resultado.features_entrada.get("features_documentais", {}).get("ifp")
            ifp_txt = f" (IFP = {ifp_val:.2f})" if isinstance(ifp_val, (int, float)) else ""
            base += (
                f"A decisao foi sobreposta pela forca probatoria dos subsidios{ifp_txt}: "
                f"documentacao agregada acima do limiar de {cfg.OVERRIDE_IFP_ALTO:.2f}. "
                f"Recomenda-se DEFESA independente do modelo ML."
            )
        elif resultado.razao_override == RazaoOverride.IFP_FRACO:
            ifp_val = resultado.features_entrada.get("features_documentais", {}).get("ifp")
            ifp_txt = f" (IFP = {ifp_val:.2f})" if isinstance(ifp_val, (int, float)) else ""
            base += (
                f"A decisao foi sobreposta pela fragilidade dos subsidios{ifp_txt}: "
                f"documentacao agregada abaixo do limiar de {cfg.OVERRIDE_IFP_BAIXO:.2f}. "
                f"Recomenda-se ACORDO (valor sugerido: "
                f"R$ {resultado.valor_acordo_sugerido:,.2f}, alpha = {resultado.alpha_aplicado:.2f})."
            )
        elif resultado.razao_override == RazaoOverride.DOCUMENTACAO_COMPLETA_SEM_FRAUDE:
            base += (
                "A decisao foi sobreposta pela regra documental: contrato assinado, "
                "comprovante TED e laudo favoravel presentes, com baixo score de fraude. "
                "Recomenda-se DEFESA independente do modelo ML."
            )
        elif resultado.razao_override == RazaoOverride.FRAUDE_CONFIRMADA_SEM_CONTRATO:
            base += (
                f"A decisao foi sobreposta pela regra documental: alto score de fraude "
                f"sem contrato assinado. Recomenda-se ACORDO (valor sugerido: "
                f"R$ {resultado.valor_acordo_sugerido:,.2f}, alpha = {resultado.alpha_aplicado:.2f})."
            )
    elif resultado.decisao == Decisao.ACORDO:
        base += (
            f"Valor sugerido de acordo: R$ {resultado.valor_acordo_sugerido:,.2f} "
            f"(alpha = {resultado.alpha_aplicado:.2f} x custo esperado). "
            f"Custo esperado (R$ {resultado.custo_esperado_defesa:,.2f}) supera o "
            f"limiar de R$ {resultado.limiar_aplicado:,.2f}."
        )
    else:
        base += (
            f"Defender e mais vantajoso porque o custo esperado "
            f"(R$ {resultado.custo_esperado_defesa:,.2f}) esta abaixo do limiar de "
            f"R$ {resultado.limiar_aplicado:,.2f}."
        )
    base += f" Politica aplicada: {resultado.policy}."
    return base


class MotorDecisao:
    """Carrega modelos treinados e parametros otimizados para inferir decisoes."""

    def __init__(
        self,
        modelo_a,
        modelo_b,
        modelos_quantis: dict,
        encoder,
        stats: feat.TargetEncodingStats,
        valor_causa_bins: tuple[float, float],
        parametros: dict,
        policy: str,
    ):
        self.modelo_a = modelo_a
        self.modelo_b = modelo_b
        self.modelos_quantis = modelos_quantis
        self.encoder = encoder
        self.stats = stats
        self.valor_causa_bins = valor_causa_bins
        self.parametros = parametros
        self.policy = policy

        politica = parametros["politicas"][policy]
        self.alpha = float(politica["alpha"])
        self.limiar = float(politica["limiar"])
        self.cp = float(parametros["cp"])

    @classmethod
    def carregar(cls, policy: str = cfg.POLICY_DEFAULT) -> "MotorDecisao":
        modelo_a = joblib.load(cfg.MODEL_A_PATH)
        modelo_b = joblib.load(cfg.MODEL_B_PATH)
        modelos_quantis = joblib.load(cfg.MODEL_B_QUANTIS_PATH)
        encoder, stats, bins = feat.carregar_artefatos_features()
        with open(cfg.PARAMS_OTIMIZADOS_PATH, "r", encoding="utf-8") as f:
            parametros = json.load(f)

        if policy not in parametros["politicas"]:
            disp = list(parametros["politicas"].keys())
            raise ValueError(f"Policy '{policy}' invalida. Disponiveis: {disp}")

        return cls(modelo_a, modelo_b, modelos_quantis, encoder, stats, bins, parametros, policy)

    def _prever(self, X: pd.DataFrame) -> tuple[float, float, tuple[float, float]]:
        p_l = float(self.modelo_a.predict_proba(X)[:, 1][0])
        vc = float(np.clip(np.expm1(self.modelo_b.predict(X))[0], 0.0, None))
        q10 = float(np.clip(np.expm1(self.modelos_quantis["q10"].predict(X))[0], 0.0, None))
        q90 = float(np.clip(np.expm1(self.modelos_quantis["q90"].predict(X))[0], 0.0, None))
        return p_l, vc, (q10, q90)

    def decidir(
        self,
        uf: str,
        sub_assunto: str,
        valor_causa: float,
        features_documentais: Optional[dict] = None,
    ) -> ResultadoDecisao:
        X = feat.build_features_single(
            uf=uf,
            sub_assunto=sub_assunto,
            valor_causa=valor_causa,
            encoder=self.encoder,
            stats=self.stats,
            valor_causa_bins=self.valor_causa_bins,
        )

        p_l, vc, faixa = self._prever(X)
        e_c_defesa = p_l * vc + self.cp

        override, razao = aplicar_overrides_documentais(features_documentais)
        if override is not None:
            decisao_final = override
        else:
            decisao_final = Decisao.ACORDO if e_c_defesa > self.limiar else Decisao.DEFESA

        v_acordo = self.alpha * e_c_defesa if decisao_final == Decisao.ACORDO else None

        resultado = ResultadoDecisao(
            decisao=decisao_final,
            probabilidade_perda=p_l,
            valor_condenacao_estimado=vc,
            valor_condenacao_faixa=faixa,
            custo_processual=self.cp,
            custo_esperado_defesa=e_c_defesa,
            valor_acordo_sugerido=v_acordo,
            alpha_aplicado=self.alpha,
            limiar_aplicado=self.limiar,
            policy=self.policy,
            override_aplicado=override is not None,
            razao_override=razao,
            explicacao="",
            features_entrada={
                "uf": uf,
                "sub_assunto": sub_assunto,
                "valor_causa": valor_causa,
                "features_documentais": features_documentais or {},
            },
        )
        resultado.explicacao = _explicar(resultado)
        return resultado


def _custo_total_simulado(
    alpha: float,
    limiar: float,
    cp: float,
    p_l: np.ndarray,
    vc_previsto: np.ndarray,
    vc_real: np.ndarray,
    perde_real: np.ndarray,
) -> tuple[float, float]:
    e_c = p_l * vc_previsto + cp
    acorda = e_c > limiar
    n = len(p_l)
    custo_acordo = alpha * e_c[acorda]
    custo_defesa = np.where(perde_real[~acorda] == 1, vc_real[~acorda], 0.0) + cp
    custo_total = float(custo_acordo.sum() + custo_defesa.sum())
    taxa_acordo = float(acorda.mean()) if n > 0 else 0.0
    return custo_total, taxa_acordo


def estimar_cp(df_perdas: pd.DataFrame) -> float:
    return float(df_perdas[cfg.COL_VALOR_CONDENACAO].median() * cfg.CP_FATOR_MEDIANA)


def rodar_backtesting(salvar: bool = True) -> dict:
    """Treina predicoes sobre TODA a base historica usando cross-prediction
    (evitando vazamento: usa o modelo treinado no split de treino para prever
    o split de teste, e vice-versa via re-treino rapido no teste para prever
    o treino). Para simplicidade de tempo, usamos o split de teste como
    universo de backtesting - ainda sao 12000 processos.

    Gera:
      - backtesting.csv com todas as combinacoes (alpha, limiar) testadas
      - parametros_otimizados.json com as 5 politicas nomeadas
      - report_politicas.md e grafico PNG
    """
    df = feat.carregar_base()
    _, df_test = feat.split_treino_teste(df)

    encoder, stats, _ = feat.carregar_artefatos_features()
    X_test, _, _ = feat.build_features(df_test, encoder=encoder, stats=stats)

    modelo_a = joblib.load(cfg.MODEL_A_PATH)
    modelo_b = joblib.load(cfg.MODEL_B_PATH)

    p_l = modelo_a.predict_proba(X_test)[:, 1]
    vc_pred = np.clip(np.expm1(modelo_b.predict(X_test)), 0.0, None)
    vc_real = df_test[cfg.COL_VALOR_CONDENACAO].astype(float).values
    perde_real = df_test["perde"].values

    df_perdas_train = df[df["perde"] == 1]
    cp = estimar_cp(df_perdas_train)
    print(f"Cp estimado (mediana perdas x {cfg.CP_FATOR_MEDIANA}): R$ {cp:,.2f}")

    custo_defender_tudo = float((np.where(perde_real == 1, vc_real, 0.0) + cp).sum())
    n = len(df_test)

    print(f"Rodando backtesting em {n} processos (teste)...")
    linhas = []
    for alpha in cfg.ALPHAS_GRID:
        for limiar in cfg.LIMIARES_GRID:
            custo, taxa = _custo_total_simulado(
                alpha, limiar, cp, p_l, vc_pred, vc_real, perde_real
            )
            economia = custo_defender_tudo - custo
            linhas.append(
                {
                    "alpha": alpha,
                    "limiar": limiar,
                    "taxa_acordo": taxa,
                    "custo_total": custo,
                    "economia_total": economia,
                    "economia_por_processo": economia / n,
                    "economia_pct": economia / custo_defender_tudo,
                }
            )
    df_bt = pd.DataFrame(linhas)

    politicas = {}
    for nome, taxa_alvo in cfg.POLICIES_ALVO.items():
        df_bt_sorted = df_bt.assign(dist=lambda d: (d["taxa_acordo"] - taxa_alvo).abs())
        df_bt_filtrado = df_bt_sorted[df_bt_sorted["dist"] <= 0.08]
        if df_bt_filtrado.empty:
            df_bt_filtrado = df_bt_sorted.nsmallest(20, "dist")
        best = df_bt_filtrado.nlargest(1, "economia_total").iloc[0]
        politicas[nome] = {
            "taxa_alvo": taxa_alvo,
            "alpha": float(best["alpha"]),
            "limiar": float(best["limiar"]),
            "taxa_acordo_efetiva": float(best["taxa_acordo"]),
            "economia_total": float(best["economia_total"]),
            "economia_por_processo": float(best["economia_por_processo"]),
            "economia_pct": float(best["economia_pct"]),
            "custo_total": float(best["custo_total"]),
        }

    parametros = {
        "cp": cp,
        "custo_defender_tudo_backtest": custo_defender_tudo,
        "n_processos_backtest": n,
        "politicas": politicas,
        "policy_default": cfg.POLICY_DEFAULT,
    }

    if salvar:
        df_bt.to_csv(cfg.BACKTESTING_CSV_PATH, index=False)
        with open(cfg.PARAMS_OTIMIZADOS_PATH, "w", encoding="utf-8") as f:
            json.dump(parametros, f, indent=2, ensure_ascii=False)
        _gerar_report_politicas(parametros)
        _gerar_grafico_backtesting(df_bt)

    print("\n=== Catalogo de Politicas ===")
    for nome, p in politicas.items():
        print(
            f"  {nome:14s}: alpha={p['alpha']:.2f}, limiar=R$ {p['limiar']:>6,.0f}, "
            f"acordos={p['taxa_acordo_efetiva']:>5.1%}, "
            f"economia=R$ {p['economia_total']:>12,.0f} "
            f"({p['economia_pct']:>5.1%})"
        )
    print(f"\nBaseline defender tudo: R$ {custo_defender_tudo:,.0f}")
    print(f"Arquivos salvos em: {cfg.MODELS_DIR}")

    return parametros


def _gerar_report_politicas(parametros: dict) -> None:
    linhas = [
        "# Catalogo de Politicas - Motor de Decisao",
        "",
        f"- Cp estimado: R$ {parametros['cp']:,.2f}",
        f"- Baseline (defender tudo): R$ {parametros['custo_defender_tudo_backtest']:,.0f}",
        f"- Processos no backtest: {parametros['n_processos_backtest']:,}",
        "",
        "| Politica | alpha | Limiar | % Acordos | Economia Total | Economia/Proc | Economia % |",
        "|---|---|---|---|---|---|---|",
    ]
    for nome, p in parametros["politicas"].items():
        linhas.append(
            f"| {nome} | {p['alpha']:.2f} | R$ {p['limiar']:,.0f} | "
            f"{p['taxa_acordo_efetiva']:.1%} | R$ {p['economia_total']:,.0f} | "
            f"R$ {p['economia_por_processo']:,.0f} | {p['economia_pct']:.1%} |"
        )
    linhas.append("")
    linhas.append(f"**Politica default:** {parametros['policy_default']}")
    cfg.REPORT_POLICIES_PATH.write_text("\n".join(linhas), encoding="utf-8")


def _gerar_grafico_backtesting(df_bt: pd.DataFrame) -> None:
    fig, ax = plt.subplots(figsize=(9, 6))
    scatter = ax.scatter(
        df_bt["taxa_acordo"] * 100,
        df_bt["economia_total"] / 1e6,
        c=df_bt["alpha"],
        cmap="viridis",
        alpha=0.5,
        s=25,
    )
    ax.set_xlabel("Taxa de acordo (%)")
    ax.set_ylabel("Economia vs defender tudo (R$ milhoes)")
    ax.set_title("Backtesting: Economia vs Taxa de Acordo")
    ax.grid(True, alpha=0.3)
    plt.colorbar(scatter, ax=ax, label="alpha")
    fig.tight_layout()
    fig.savefig(cfg.BACKTESTING_PLOT_PATH, dpi=100)
    plt.close(fig)


def pipeline_completo() -> None:
    """Treina os 2 modelos + quantis e otimiza parametros em sequencia."""
    from . import modelo_probabilidade_perda as m_a
    from . import modelo_estimativa_condenacao as m_b

    print("### Fase 2/3 - Features e Modelo A ###")
    m_a.treinar_modelo_a()
    print("\n### Fase 4 - Modelo B e Quantis ###")
    m_b.treinar_modelo_b()
    m_b.treinar_quantis()
    print("\n### Fase 5 - Backtesting e otimizacao ###")
    rodar_backtesting()


def _demo_casos(motor: MotorDecisao) -> None:
    casos = [
        ("SP", "Golpe", 5000.0, None),
        ("SP", "Golpe", 25000.0, None),
        ("CE", "Genérico", 3000.0, None),
        (
            "SP",
            "Golpe",
            15000.0,
            {
                "tem_contrato_assinado": True,
                "tem_comprovante_ted": True,
                "laudo_favoravel": True,
                "score_fraude": 0.15,
            },
        ),
        (
            "MT",
            "Golpe",
            12000.0,
            {
                "tem_contrato_assinado": False,
                "tem_comprovante_ted": False,
                "laudo_favoravel": False,
                "score_fraude": 0.85,
            },
        ),
    ]
    print(f"\n=== Exemplos de decisao (policy = {motor.policy}) ===")
    for uf, sub, valor, fd in casos:
        r = motor.decidir(uf, sub, valor, features_documentais=fd)
        tag = f" [OVERRIDE: {r.razao_override.value}]" if r.override_aplicado else ""
        print(
            f"\n[UF={uf}, sub={sub}, valor=R$ {valor:,.0f}{tag}]\n"
            f"  -> {r.decisao.value} | P(L)={r.probabilidade_perda:.1%} | "
            f"Vc=R$ {r.valor_condenacao_estimado:,.0f} "
            f"(IC80 R$ {r.valor_condenacao_faixa[0]:,.0f}-R$ {r.valor_condenacao_faixa[1]:,.0f})"
        )
        if r.valor_acordo_sugerido is not None:
            print(f"  Valor sugerido: R$ {r.valor_acordo_sugerido:,.2f}")


if __name__ == "__main__":
    import sys

    if "--so-backtest" in sys.argv:
        rodar_backtesting()
    elif "--so-demo" in sys.argv:
        pass
    else:
        pipeline_completo()

    motor = MotorDecisao.carregar()
    _demo_casos(motor)
