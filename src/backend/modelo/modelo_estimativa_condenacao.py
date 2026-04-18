"""Modelo B - Estimativa de Condenacao Vc.

Regressao com XGBRegressor treinada apenas nos processos perdidos (Vc > 0).
Target em escala logaritmica (log1p) e de-transformado para R$ na predicao
para lidar com a cauda longa da distribuicao de condenacoes.
"""
from __future__ import annotations

import json

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

from . import config as cfg
from . import features as feat


def _mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mask = y_true > 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])))


def treinar_modelo_b() -> dict:
    df = feat.carregar_base()
    df_train_full, df_test_full = feat.split_treino_teste(df)

    df_train = df_train_full[df_train_full["perde"] == 1].reset_index(drop=True)
    df_test = df_test_full[df_test_full["perde"] == 1].reset_index(drop=True)

    encoder, stats, _ = feat.carregar_artefatos_features()
    X_train, _, _ = feat.build_features(df_train, encoder=encoder, stats=stats)
    X_test, _, _ = feat.build_features(df_test, encoder=encoder, stats=stats)

    y_train_raw = df_train[cfg.COL_VALOR_CONDENACAO].astype(float).values
    y_test_raw = df_test[cfg.COL_VALOR_CONDENACAO].astype(float).values

    y_train_log = np.log1p(y_train_raw)

    print(f"Treinando XGBRegressor (log target) em {len(df_train)} perdas...")
    modelo = XGBRegressor(**cfg.XGB_REGRESSOR_PARAMS)
    modelo.fit(X_train, y_train_log)

    y_pred_log = modelo.predict(X_test)
    y_pred = np.expm1(y_pred_log)
    y_pred = np.clip(y_pred, 0, None)

    metricas = {
        "mae": float(mean_absolute_error(y_test_raw, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_test_raw, y_pred))),
        "r2": float(r2_score(y_test_raw, y_pred)),
        "mape": _mape(y_test_raw, y_pred),
        "media_real_teste": float(y_test_raw.mean()),
        "media_prevista_teste": float(y_pred.mean()),
        "n_train": int(len(y_train_raw)),
        "n_test": int(len(y_test_raw)),
    }

    _plot_real_vs_previsto(y_test_raw, y_pred)

    joblib.dump(modelo, cfg.MODEL_B_PATH)
    with open(cfg.METRICS_B_PATH, "w", encoding="utf-8") as f:
        json.dump(metricas, f, indent=2, ensure_ascii=False)

    print("\n=== Metricas Modelo B ===")
    for k, v in metricas.items():
        if isinstance(v, float):
            print(f"  {k}: {v:,.4f}")
        else:
            print(f"  {k}: {v}")
    print(f"\nArtefatos salvos: {cfg.MODEL_B_PATH.name}, {cfg.METRICS_B_PATH.name}")

    return metricas


def treinar_quantis() -> dict:
    df = feat.carregar_base()
    df_train_full, df_test_full = feat.split_treino_teste(df)

    df_train = df_train_full[df_train_full["perde"] == 1].reset_index(drop=True)
    df_test = df_test_full[df_test_full["perde"] == 1].reset_index(drop=True)

    encoder, stats, _ = feat.carregar_artefatos_features()
    X_train, _, _ = feat.build_features(df_train, encoder=encoder, stats=stats)
    X_test, _, _ = feat.build_features(df_test, encoder=encoder, stats=stats)

    y_train_raw = df_train[cfg.COL_VALOR_CONDENACAO].astype(float).values
    y_test_raw = df_test[cfg.COL_VALOR_CONDENACAO].astype(float).values
    y_train_log = np.log1p(y_train_raw)

    modelos = {}
    metricas = {"quantis": list(cfg.QUANTIS), "pinball_loss": {}}

    for q in cfg.QUANTIS:
        print(f"Treinando quantil {q}...")
        params = dict(cfg.XGB_QUANTILE_PARAMS)
        params["quantile_alpha"] = q
        m = XGBRegressor(**params)
        m.fit(X_train, y_train_log)
        pred_log = m.predict(X_test)
        pred = np.clip(np.expm1(pred_log), 0, None)
        pinball = _pinball_loss(y_test_raw, pred, q)
        metricas["pinball_loss"][f"q{int(q*100):02d}"] = float(pinball)
        modelos[f"q{int(q*100):02d}"] = m

    joblib.dump(modelos, cfg.MODEL_B_QUANTIS_PATH)

    q10, q50, q90 = (
        np.clip(np.expm1(modelos["q10"].predict(X_test)), 0, None),
        np.clip(np.expm1(modelos["q50"].predict(X_test)), 0, None),
        np.clip(np.expm1(modelos["q90"].predict(X_test)), 0, None),
    )
    cobertura_80 = float(((y_test_raw >= q10) & (y_test_raw <= q90)).mean())
    metricas["cobertura_empirica_IC80"] = cobertura_80
    with open(cfg.METRICS_B_QUANTIS_PATH, "w", encoding="utf-8") as f:
        json.dump(metricas, f, indent=2, ensure_ascii=False)

    print("\n=== Metricas Quantis (Vc | perda) ===")
    print(f"  Pinball loss por quantil: {metricas['pinball_loss']}")
    print(f"  Cobertura empirica IC 80% (alvo 0.80): {cobertura_80:.3f}")
    print(f"\nArtefatos salvos: {cfg.MODEL_B_QUANTIS_PATH.name}, {cfg.METRICS_B_QUANTIS_PATH.name}")

    return metricas


def _pinball_loss(y_true: np.ndarray, y_pred: np.ndarray, q: float) -> float:
    diff = y_true - y_pred
    return float(np.mean(np.maximum(q * diff, (q - 1) * diff)))


def _plot_real_vs_previsto(y_true: np.ndarray, y_pred: np.ndarray) -> None:
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.scatter(y_true, y_pred, alpha=0.2, s=10)
    lim = max(y_true.max(), y_pred.max())
    ax.plot([0, lim], [0, lim], "r--", alpha=0.7, label="Identidade (y=x)")
    ax.set_xlabel("Condenacao real (R$)")
    ax.set_ylabel("Condenacao prevista (R$)")
    ax.set_title("Modelo B - Real vs Previsto (conjunto de teste, perdas)")
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(cfg.REGRESSAO_SCATTER_PATH, dpi=100)
    plt.close(fig)


if __name__ == "__main__":
    treinar_modelo_b()
    print()
    treinar_quantis()
