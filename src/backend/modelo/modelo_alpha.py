"""Modelo de alpha condicional via quantile regression.

Aprende, a partir dos 280 acordos reais da base, a distribuicao
condicional do alpha aceito (V_acordo / E[C_defesa]) em funcao das
features do processo. A inferencia devolve multiplos quantis - cada
politica do motor mapeia para um quantil especifico:

  - Conservadora -> quantil alto (alpha maior, alta chance de aceite)
  - Moderada     -> mediana condicional
  - Arriscada    -> quantil baixo (alpha menor, maior risco de recusa)

Interpretacao do quantil como "taxa historica de fechamento": um alpha
no q75 significa que 75% dos acordos similares foram fechados com alpha
>= esse valor. Nao e probabilidade real de aceite (a base nao tem
recusas), mas e uma proxy honesta - documentar na apresentacao.

Uso:
    python -m src.backend.modelo.modelo_alpha   # treina e salva artefato

    from src.backend.modelo.modelo_alpha import prever_alphas
    alphas = prever_alphas(X)  # dict {quantil: alpha_predito}
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import joblib
import numpy as np
import pandas as pd
from xgboost import XGBRegressor

from . import config as cfg
from . import features as feat


ALPHA_CLIP_MIN = 0.10
ALPHA_CLIP_MAX = 1.00


@dataclass
class MetricasAlpha:
    n_acordos: int
    quantis_treinados: list[float]
    pinball_loss_por_quantil: dict[float, float]
    alpha_empirico_describe: dict[str, float]


def _pinball_loss(y_true: np.ndarray, y_pred: np.ndarray, q: float) -> float:
    e = y_true - y_pred
    return float(np.mean(np.maximum(q * e, (q - 1) * e)))


def _ajustar_te_sem_acordos(df_full: pd.DataFrame) -> feat.TargetEncodingStats:
    """Refita target encoding excluindo linhas de acordo (Resultado micro == 'Acordo').

    Corrige vazamento indireto: sem isso, as stats por UF (`uf_taxa_perda_hist`,
    `uf_ticket_medio_cond`) carregam informacao dos mesmos 280 acordos que serao
    usados como target do modelo_alpha. Esse TE 'limpo' e usado APENAS no treino
    do modelo_alpha; a inferencia em producao continua com o TE original (fit
    na base inteira), que e equivalente a out-of-fold por construcao ja que o
    processo em inferencia nunca esta no treino.
    """
    df_sem_acordos = df_full[df_full["Resultado micro"] != "Acordo"].copy()
    df_sem_acordos["perde"] = (df_sem_acordos[cfg.COL_RESULTADO_MACRO] == cfg.VAL_PERDA).astype(int)
    return feat.ajustar_target_encoding(df_sem_acordos)


def _calcular_alpha_empirico(
    df_acordos: pd.DataFrame,
    modelo_a,
    modelo_b,
    encoder,
    stats: feat.TargetEncodingStats,
    valor_causa_bins: tuple[float, float],
    cp: float,
) -> tuple[pd.DataFrame, np.ndarray]:
    """Monta X e calcula alpha_empirico = V_acordo / E[C_defesa] para cada acordo."""
    rows = []
    for _, r in df_acordos.iterrows():
        X = feat.build_features_single(
            uf=r[cfg.COL_UF],
            sub_assunto=r[cfg.COL_SUB_ASSUNTO],
            valor_causa=r[cfg.COL_VALOR_CAUSA],
            encoder=encoder,
            stats=stats,
            valor_causa_bins=valor_causa_bins,
            subsidios={c: bool(r[c]) for c in cfg.FEATURES_BOOLEANAS},
        )
        rows.append(X)
    X_all = pd.concat(rows, ignore_index=True)

    p_l = modelo_a.predict_proba(X_all)[:, 1]
    vc_pred = np.clip(np.expm1(modelo_b.predict(X_all)), 0.0, None)
    e_c_defesa = p_l * vc_pred + cp
    v_acordo = df_acordos[cfg.COL_VALOR_CONDENACAO].astype(float).values
    alpha = v_acordo / np.clip(e_c_defesa, 1e-6, None)
    return X_all, alpha


def treinar_modelo_alpha(salvar: bool = True) -> tuple[dict[float, XGBRegressor], MetricasAlpha]:
    """Treina N XGBRegressors quantile nos 280 acordos reais.

    Retorna dict {quantil: modelo} + metricas (pinball loss por quantil).
    """
    print("Carregando base e filtrando acordos...")
    df = pd.read_csv(cfg.BANCO_TREINO_CSV_PATH)
    df_acordos = df[df["Resultado micro"] == "Acordo"].copy().reset_index(drop=True)
    print(f"  Acordos na base: {len(df_acordos)}")

    print("Carregando artefatos (encoder, stats, modelos A/B)...")
    encoder, _stats_prod, bins = feat.carregar_artefatos_features()
    modelo_a = joblib.load(cfg.MODEL_A_PATH)
    modelo_b = joblib.load(cfg.MODEL_B_PATH)
    with open(cfg.PARAMS_OTIMIZADOS_PATH, "r", encoding="utf-8") as f:
        parametros = json.load(f)
    cp = float(parametros["cp"])

    print("Refitando target encoding sem os 280 acordos (corrige vazamento indireto)...")
    stats_sem_acordos = _ajustar_te_sem_acordos(df)
    print(
        f"  taxa_perda_global (sem acordos): {stats_sem_acordos.taxa_perda_global:.4f} "
        f"(vs producao {_stats_prod.taxa_perda_global:.4f})"
    )

    print(f"Calculando alpha empirico (V_acordo / E[C_defesa]), Cp=R$ {cp:,.2f}...")
    X_all, alpha_empirico = _calcular_alpha_empirico(
        df_acordos, modelo_a, modelo_b, encoder, stats_sem_acordos, bins, cp
    )
    alpha_clip = np.clip(alpha_empirico, ALPHA_CLIP_MIN, ALPHA_CLIP_MAX)

    desc = pd.Series(alpha_clip).describe()
    print(f"\nDistribuicao alpha empirico (apos clip [{ALPHA_CLIP_MIN}, {ALPHA_CLIP_MAX}]):")
    for k, v in desc.items():
        print(f"  {k}: {v:.3f}")

    quantis = list(cfg.QUANTIS_ALPHA_GRID)
    modelos: dict[float, XGBRegressor] = {}
    pinball: dict[float, float] = {}

    print(f"\nTreinando {len(quantis)} quantis: {quantis}")
    for q in quantis:
        params = {
            "objective": "reg:quantileerror",
            "quantile_alpha": q,
            "n_estimators": 200,
            "max_depth": 3,
            "learning_rate": 0.05,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "random_state": cfg.RANDOM_STATE,
            "n_jobs": -1,
        }
        m = XGBRegressor(**params)
        m.fit(X_all, alpha_clip)
        pred = m.predict(X_all)
        loss = _pinball_loss(alpha_clip, pred, q)
        modelos[q] = m
        pinball[q] = loss
        print(f"  q={q:.2f}: pinball_loss (in-sample)={loss:.4f}, pred_mean={pred.mean():.3f}")

    metricas = MetricasAlpha(
        n_acordos=len(df_acordos),
        quantis_treinados=quantis,
        pinball_loss_por_quantil=pinball,
        alpha_empirico_describe={k: float(v) for k, v in desc.items()},
    )

    if salvar:
        joblib.dump({"modelos": modelos, "quantis": quantis}, cfg.MODELO_ALPHA_PATH)
        with open(cfg.METRICS_ALPHA_PATH, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "n_acordos": metricas.n_acordos,
                    "quantis_treinados": metricas.quantis_treinados,
                    "pinball_loss_por_quantil": {str(k): v for k, v in metricas.pinball_loss_por_quantil.items()},
                    "alpha_empirico_describe": metricas.alpha_empirico_describe,
                    "alpha_clip_min": ALPHA_CLIP_MIN,
                    "alpha_clip_max": ALPHA_CLIP_MAX,
                },
                f,
                indent=2,
                ensure_ascii=False,
            )
        print(f"\nArtefato salvo: {cfg.MODELO_ALPHA_PATH}")
        print(f"Metricas salvas: {cfg.METRICS_ALPHA_PATH}")

    return modelos, metricas


def carregar_modelo_alpha() -> dict[float, XGBRegressor]:
    payload = joblib.load(cfg.MODELO_ALPHA_PATH)
    return payload["modelos"]


def prever_alphas(X: pd.DataFrame, modelos: dict[float, XGBRegressor] | None = None) -> dict[float, float]:
    """Prediz alpha para cada quantil treinado.

    X deve ser o DataFrame de 1 linha ja montado por features.build_features_single.
    Aplica clipping [MIN, MAX] e monotonizacao (garante q_k <= q_{k+1}).
    """
    if modelos is None:
        modelos = carregar_modelo_alpha()
    quantis = sorted(modelos.keys())
    raw = np.array([float(modelos[q].predict(X)[0]) for q in quantis])
    clipped = np.clip(raw, ALPHA_CLIP_MIN, ALPHA_CLIP_MAX)
    # monotonizacao: ordena os predicts pra impor q_k <= q_{k+1}
    monot = np.maximum.accumulate(clipped)
    return {q: float(a) for q, a in zip(quantis, monot)}


def prever_alpha_para_politica(
    X: pd.DataFrame,
    politica: str,
    modelos: dict[float, XGBRegressor] | None = None,
) -> dict[str, Any]:
    """Resolve o alpha recomendado + taxa_aceite_estimada para uma politica.

    Retorna {
        "alpha": float,
        "quantil": float,
        "taxa_aceite_estimada": float,  # = quantil (proxy honesta)
        "alphas_por_quantil": dict,     # diagnostico/transparencia
    }
    """
    if politica not in cfg.POLICY_QUANTIS:
        raise ValueError(f"Politica '{politica}' invalida. Disponiveis: {list(cfg.POLICY_QUANTIS.keys())}")
    quantil = cfg.POLICY_QUANTIS[politica]
    alphas = prever_alphas(X, modelos)
    if quantil not in alphas:
        # fallback: pega o quantil mais proximo
        closest = min(alphas.keys(), key=lambda q: abs(q - quantil))
        alpha = alphas[closest]
        quantil_efetivo = closest
    else:
        alpha = alphas[quantil]
        quantil_efetivo = quantil
    return {
        "alpha": alpha,
        "quantil": quantil_efetivo,
        "taxa_aceite_estimada": quantil_efetivo,
        "alphas_por_quantil": alphas,
    }


if __name__ == "__main__":
    import sys

    sys.modules["__main__"].TargetEncodingStats = feat.TargetEncodingStats  # type: ignore[attr-defined]
    treinar_modelo_alpha()
