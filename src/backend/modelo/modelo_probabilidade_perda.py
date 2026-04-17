"""Modelo A - Probabilidade de Perda P(L).

Classificacao binaria com XGBClassifier + CalibratedClassifierCV (Platt scaling).
A calibracao garante que P(L) seja uma probabilidade real (usada na formula
financeira do motor de decisao), nao apenas um score monotonico.
"""
from __future__ import annotations

import json

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import cross_val_score
from xgboost import XGBClassifier

from . import config as cfg
from . import features as feat


def expected_calibration_error(y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 10) -> float:
    """Expected Calibration Error (ECE) com bins de largura igual."""
    bin_edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        mask = (y_prob >= bin_edges[i]) & (y_prob < bin_edges[i + 1])
        if i == n_bins - 1:
            mask |= y_prob == bin_edges[i + 1]
        if not mask.any():
            continue
        conf = y_prob[mask].mean()
        acc = y_true[mask].mean()
        ece += (mask.sum() / len(y_true)) * abs(conf - acc)
    return float(ece)


def treinar_modelo_a() -> dict:
    df = feat.carregar_base()
    df_train, df_test = feat.split_treino_teste(df)

    X_train, encoder, stats = feat.build_features(df_train)
    X_test, _, _ = feat.build_features(df_test, encoder=encoder, stats=stats)
    y_train = df_train["perde"].values
    y_test = df_test["perde"].values

    bins = feat.calcular_bins_valor_causa(df_train[cfg.COL_VALOR_CAUSA])
    feat.salvar_artefatos_features(encoder, stats, bins)

    print("Treinando XGBClassifier base...")
    base = XGBClassifier(**cfg.XGB_CLASSIFIER_PARAMS)

    print("Aplicando CalibratedClassifierCV (Platt scaling, cv=5)...")
    modelo = CalibratedClassifierCV(
        estimator=base,
        method="sigmoid",
        cv=cfg.CV_FOLDS,
    )
    modelo.fit(X_train, y_train)

    y_prob_test = modelo.predict_proba(X_test)[:, 1]
    y_pred_test = (y_prob_test >= 0.5).astype(int)

    metricas = {
        "auc_roc": float(roc_auc_score(y_test, y_prob_test)),
        "brier_score": float(brier_score_loss(y_test, y_prob_test)),
        "log_loss": float(log_loss(y_test, y_prob_test)),
        "ece": expected_calibration_error(y_test, y_prob_test),
        "taxa_perda_real_teste": float(y_test.mean()),
        "taxa_perda_prevista_teste": float(y_prob_test.mean()),
        "acuracia_corte_0_5": float((y_pred_test == y_test).mean()),
        "n_train": int(len(y_train)),
        "n_test": int(len(y_test)),
    }

    print("\nValidacao cruzada (AUC-ROC) no treino...")
    cv_scores = cross_val_score(
        CalibratedClassifierCV(estimator=XGBClassifier(**cfg.XGB_CLASSIFIER_PARAMS), method="sigmoid", cv=3),
        X_train,
        y_train,
        cv=3,
        scoring="roc_auc",
        n_jobs=-1,
    )
    metricas["cv_auc_mean"] = float(cv_scores.mean())
    metricas["cv_auc_std"] = float(cv_scores.std())

    _gerar_reliability_diagram(y_test, y_prob_test)

    joblib.dump(modelo, cfg.MODEL_A_PATH)
    with open(cfg.METRICS_A_PATH, "w", encoding="utf-8") as f:
        json.dump(metricas, f, indent=2, ensure_ascii=False)

    print("\n=== Metricas Modelo A ===")
    for k, v in metricas.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.4f}")
        else:
            print(f"  {k}: {v}")
    print(f"\nArtefatos salvos: {cfg.MODEL_A_PATH.name}, {cfg.METRICS_A_PATH.name}")

    return metricas


def _gerar_reliability_diagram(y_true: np.ndarray, y_prob: np.ndarray) -> None:
    frac_pos, mean_pred = calibration_curve(y_true, y_prob, n_bins=10, strategy="quantile")

    fig, ax = plt.subplots(figsize=(7, 6))
    ax.plot([0, 1], [0, 1], "k--", alpha=0.6, label="Perfeitamente calibrado")
    ax.plot(mean_pred, frac_pos, "o-", label="Modelo A (Platt)")
    ax.set_xlabel("Probabilidade prevista (P(L))")
    ax.set_ylabel("Frequencia observada de perda")
    ax.set_title("Reliability Diagram - Modelo A")
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(cfg.RELIABILITY_DIAGRAM_PATH, dpi=100)
    plt.close(fig)


if __name__ == "__main__":
    treinar_modelo_a()
