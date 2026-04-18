"""Motor de Decisao Juridica.

Combina as saidas dos Modelos A (P(L)) e B (Vc) numa formula financeira
para decidir ACORDO vs DEFESA e sugerir valor de acordo.

Formulas:
    E[C_defesa] = P(L) * Vc + Cp
    Decisao = ACORDO se E[C_defesa] > Limiar, senao DEFESA
    V_acordo = alpha * E[C_defesa]

alpha e previsto condicionalmente pelo modelo_alpha (quantile regression
treinado nos 280 acordos reais da base). Cada politica mapeia para um
quantil — Conservadora -> q75 (taxa de aceite ~75%), Moderada -> q50,
Arriscada -> q30 — lendo o quantil como "taxa historica de aceite".
Limiar e Cp ficam em parametros_otimizados.json, derivados dos dados.

Features documentais (do extrator de PDFs) entram como overrides
deterministicos de borda, nao como multiplicadores calibrados.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Optional

import joblib
import numpy as np
import pandas as pd

from . import config as cfg
from . import features as feat
from . import modelo_alpha as m_alpha


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
    alpha_quantil: float
    taxa_aceite_estimada: float
    alphas_por_quantil: dict = field(default_factory=dict)
    limiar_aplicado: float = 0.0
    policy: str = ""
    override_aplicado: bool = False
    razao_override: RazaoOverride = RazaoOverride.NENHUMA
    explicacao: str = ""
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

    tem_contrato = bool(features_doc.get("tem_contrato", False))
    tem_comprovante = bool(features_doc.get("tem_comprovante", False))
    tem_laudo = bool(features_doc.get("tem_laudo", False))
    laudo_favoravel = bool(features_doc.get("laudo_favoravel", tem_laudo))
    score_fraude = float(features_doc.get("score_fraude", 0.5))

    if (
        tem_contrato
        and tem_comprovante
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
            f"(alpha = {resultado.alpha_aplicado:.2f} x custo esperado; "
            f"taxa historica de aceite estimada: {resultado.taxa_aceite_estimada:.0%}). "
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
        modelos_alpha: dict,
        encoder,
        stats: feat.TargetEncodingStats,
        valor_causa_bins: tuple[float, float],
        parametros: dict,
        policy: str,
    ):
        self.modelo_a = modelo_a
        self.modelo_b = modelo_b
        self.modelos_quantis = modelos_quantis
        self.modelos_alpha = modelos_alpha
        self.encoder = encoder
        self.stats = stats
        self.valor_causa_bins = valor_causa_bins
        self.parametros = parametros
        self.policy = policy

        politica = parametros["politicas"][policy]
        self.quantil_alpha = float(politica["quantil_alpha"])
        self.limiar = float(politica["limiar"])
        self.cp = float(parametros["cp"])

    @classmethod
    def carregar(cls, policy: str = cfg.POLICY_DEFAULT) -> "MotorDecisao":
        modelo_a = joblib.load(cfg.MODEL_A_PATH)
        modelo_b = joblib.load(cfg.MODEL_B_PATH)
        modelos_quantis = joblib.load(cfg.MODEL_B_QUANTIS_PATH)
        modelos_alpha = m_alpha.carregar_modelo_alpha()
        encoder, stats, bins = feat.carregar_artefatos_features()
        with open(cfg.PARAMS_OTIMIZADOS_PATH, "r", encoding="utf-8") as f:
            parametros = json.load(f)

        if policy not in parametros["politicas"]:
            disp = list(parametros["politicas"].keys())
            raise ValueError(f"Policy '{policy}' invalida. Disponiveis: {disp}")

        return cls(
            modelo_a, modelo_b, modelos_quantis, modelos_alpha,
            encoder, stats, bins, parametros, policy,
        )

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
            subsidios=features_documentais,
        )

        p_l, vc, faixa = self._prever(X)
        e_c_defesa = p_l * vc + self.cp

        alphas_cond = m_alpha.prever_alphas(X, self.modelos_alpha)
        quantil = self.quantil_alpha
        if quantil not in alphas_cond:
            quantil = min(alphas_cond.keys(), key=lambda q: abs(q - self.quantil_alpha))
        alpha_aplicado = alphas_cond[quantil]

        override, razao = aplicar_overrides_documentais(features_documentais)
        if override is not None:
            decisao_final = override
        else:
            decisao_final = Decisao.ACORDO if e_c_defesa > self.limiar else Decisao.DEFESA

        v_acordo = alpha_aplicado * e_c_defesa if decisao_final == Decisao.ACORDO else None

        resultado = ResultadoDecisao(
            decisao=decisao_final,
            probabilidade_perda=p_l,
            valor_condenacao_estimado=vc,
            valor_condenacao_faixa=faixa,
            custo_processual=self.cp,
            custo_esperado_defesa=e_c_defesa,
            valor_acordo_sugerido=v_acordo,
            alpha_aplicado=alpha_aplicado,
            alpha_quantil=quantil,
            taxa_aceite_estimada=quantil,
            alphas_por_quantil=alphas_cond,
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


def pipeline_completo() -> None:
    """Treina Modelo A, Modelo B (+ quantis) e o modelo de alpha condicional.

    Alpha e previsto por processo a partir dos 280 acordos reais via
    quantile regression (modelo_alpha). Limiares por politica estao em
    parametros_otimizados.json.
    """
    from . import modelo_probabilidade_perda as m_a
    from . import modelo_estimativa_condenacao as m_b

    print("### Fase 2/3 - Features e Modelo A ###")
    m_a.treinar_modelo_a()
    print("\n### Fase 4 - Modelo B e Quantis ###")
    m_b.treinar_modelo_b()
    m_b.treinar_quantis()
    print("\n### Fase 5 - Modelo de alpha condicional (280 acordos reais) ###")
    m_alpha.treinar_modelo_alpha()


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
                "tem_contrato": True,
                "tem_extrato": True,
                "tem_comprovante": True,
                "tem_dossie": True,
                "tem_demonstrativo": True,
                "tem_laudo": True,
                "laudo_favoravel": True,
                "score_fraude": 0.15,
            },
        ),
        (
            "MT",
            "Golpe",
            12000.0,
            {
                "tem_contrato": False,
                "tem_extrato": False,
                "tem_comprovante": False,
                "tem_dossie": False,
                "tem_demonstrativo": False,
                "tem_laudo": False,
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

    if "--so-demo" not in sys.argv:
        pipeline_completo()

    motor = MotorDecisao.carregar()
    _demo_casos(motor)
