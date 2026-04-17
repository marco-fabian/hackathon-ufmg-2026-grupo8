"""Feature engineering para os modelos A e B.

Pipeline reproduzivel usado no treino e na inferencia. Salva o OrdinalEncoder
e as estatisticas de target encoding para que a inferencia use exatamente a
mesma transformacao.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OrdinalEncoder

from . import config as cfg


@dataclass
class TargetEncodingStats:
    """Estatisticas historicas por UF (ajustadas apenas no fold de treino)."""

    taxa_perda_global: float
    condenacao_mediana_global: float
    taxa_perda_por_uf: dict[str, float]
    ticket_medio_por_uf: dict[str, float]
    smoothing: float

    def taxa_perda(self, uf: str) -> float:
        return self.taxa_perda_por_uf.get(uf, self.taxa_perda_global)

    def ticket_medio(self, uf: str) -> float:
        return self.ticket_medio_por_uf.get(uf, self.condenacao_mediana_global)


def carregar_base(path=cfg.DATA_PATH) -> pd.DataFrame:
    df = pd.read_excel(path)
    df.columns = [c.strip() for c in df.columns]

    if df.isna().any().any():
        raise ValueError("Base contem valores nulos; tratamento nao implementado.")
    df["perde"] = (df[cfg.COL_RESULTADO_MACRO] == cfg.VAL_PERDA).astype(int)
    return df


def ajustar_target_encoding(df_treino: pd.DataFrame) -> TargetEncodingStats:
    """Calcula taxa_perda e ticket_medio por UF apenas no conjunto de treino."""
    taxa_global = float(df_treino["perde"].mean())
    perdas = df_treino[df_treino["perde"] == 1]
    cond_mediana_global = float(perdas[cfg.COL_VALOR_CONDENACAO].median())

    agg = df_treino.groupby(cfg.COL_UF).agg(
        n=("perde", "size"),
        perdas=("perde", "sum"),
    )
    agg["taxa"] = (agg["perdas"] + cfg.TARGET_ENCODING_SMOOTHING * taxa_global) / (
        agg["n"] + cfg.TARGET_ENCODING_SMOOTHING
    )

    ticket = (
        df_treino[df_treino["perde"] == 1]
        .groupby(cfg.COL_UF)[cfg.COL_VALOR_CONDENACAO]
        .median()
    )

    return TargetEncodingStats(
        taxa_perda_global=taxa_global,
        condenacao_mediana_global=cond_mediana_global,
        taxa_perda_por_uf=agg["taxa"].to_dict(),
        ticket_medio_por_uf=ticket.to_dict(),
        smoothing=cfg.TARGET_ENCODING_SMOOTHING,
    )


def _bin_valor_causa(serie: pd.Series) -> pd.Series:
    return pd.qcut(serie, q=3, labels=[0, 1, 2], duplicates="drop").astype(int)


def build_features(
    df: pd.DataFrame,
    encoder: Optional[OrdinalEncoder] = None,
    stats: Optional[TargetEncodingStats] = None,
) -> tuple[pd.DataFrame, OrdinalEncoder, TargetEncodingStats]:
    """Monta a matriz X.

    Se encoder/stats forem None, ajusta no df (modo fit). Caso contrario,
    usa os objetos ja ajustados (modo transform para inferencia).
    """
    fit_mode = encoder is None or stats is None
    if fit_mode:
        stats = ajustar_target_encoding(df)
        encoder = OrdinalEncoder(
            handle_unknown="use_encoded_value",
            unknown_value=-1,
            dtype=np.int32,
        )
        encoder.fit(df[cfg.FEATURES_CATEGORICAS])

    X = pd.DataFrame(index=df.index)
    cat_encoded = encoder.transform(df[cfg.FEATURES_CATEGORICAS])
    for i, col in enumerate(cfg.FEATURES_CATEGORICAS):
        X[col] = cat_encoded[:, i]

    X[cfg.COL_VALOR_CAUSA] = df[cfg.COL_VALOR_CAUSA].astype(float)
    X["log_valor_causa"] = np.log1p(df[cfg.COL_VALOR_CAUSA].astype(float))
    X["valor_causa_bin"] = _bin_valor_causa(df[cfg.COL_VALOR_CAUSA])

    X["uf_taxa_perda_hist"] = df[cfg.COL_UF].map(stats.taxa_perda_por_uf).fillna(
        stats.taxa_perda_global
    )
    X["uf_ticket_medio_cond"] = df[cfg.COL_UF].map(stats.ticket_medio_por_uf).fillna(
        stats.condenacao_mediana_global
    )

    return X, encoder, stats


def build_features_single(
    uf: str,
    sub_assunto: str,
    valor_causa: float,
    encoder: OrdinalEncoder,
    stats: TargetEncodingStats,
    valor_causa_bins: tuple[float, float],
) -> pd.DataFrame:
    """Transforma um unico processo em DataFrame de 1 linha pronto para predicao."""
    row = pd.DataFrame(
        {cfg.COL_UF: [uf], cfg.COL_SUB_ASSUNTO: [sub_assunto]}
    )
    cat_encoded = encoder.transform(row)
    X = pd.DataFrame(index=[0])
    for i, col in enumerate(cfg.FEATURES_CATEGORICAS):
        X[col] = cat_encoded[:, i]

    X[cfg.COL_VALOR_CAUSA] = float(valor_causa)
    X["log_valor_causa"] = float(np.log1p(valor_causa))

    q1, q2 = valor_causa_bins
    if valor_causa <= q1:
        bin_idx = 0
    elif valor_causa <= q2:
        bin_idx = 1
    else:
        bin_idx = 2
    X["valor_causa_bin"] = bin_idx

    X["uf_taxa_perda_hist"] = stats.taxa_perda(uf)
    X["uf_ticket_medio_cond"] = stats.ticket_medio(uf)
    return X


def split_treino_teste(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    df_train, df_test = train_test_split(
        df,
        test_size=cfg.TEST_SIZE,
        stratify=df["perde"],
        random_state=cfg.RANDOM_STATE,
    )
    return df_train.reset_index(drop=True), df_test.reset_index(drop=True)


def salvar_artefatos_features(
    encoder: OrdinalEncoder,
    stats: TargetEncodingStats,
    valor_causa_bins: tuple[float, float],
) -> None:
    joblib.dump(encoder, cfg.ENCODER_PATH)
    joblib.dump({"stats": stats, "valor_causa_bins": valor_causa_bins}, cfg.TARGET_ENC_STATS_PATH)


def carregar_artefatos_features() -> tuple[OrdinalEncoder, TargetEncodingStats, tuple[float, float]]:
    encoder = joblib.load(cfg.ENCODER_PATH)
    payload = joblib.load(cfg.TARGET_ENC_STATS_PATH)
    return encoder, payload["stats"], payload["valor_causa_bins"]


def calcular_bins_valor_causa(serie: pd.Series) -> tuple[float, float]:
    q1 = float(serie.quantile(1 / 3))
    q2 = float(serie.quantile(2 / 3))
    return q1, q2


if __name__ == "__main__":
    df = carregar_base()
    print(f"Base carregada: {len(df)} linhas")
    print(f"Taxa de perda: {df['perde'].mean():.1%}")
    df_train, df_test = split_treino_teste(df)
    print(f"Treino: {len(df_train)} | Teste: {len(df_test)}")

    X_train, encoder, stats = build_features(df_train)
    X_test, _, _ = build_features(df_test, encoder=encoder, stats=stats)

    bins = calcular_bins_valor_causa(df_train[cfg.COL_VALOR_CAUSA])
    salvar_artefatos_features(encoder, stats, bins)

    print(f"\nFeatures montadas: {list(X_train.columns)}")
    print(f"Shape X_train: {X_train.shape} | X_test: {X_test.shape}")
    print(f"\nEstatisticas globais:")
    print(f"  Taxa perda global = {stats.taxa_perda_global:.4f}")
    print(f"  Condenacao mediana (perdas) = R$ {stats.condenacao_mediana_global:,.2f}")
    print(f"  Bins valor_causa: {bins}")
    print("\nArtefatos salvos em:", cfg.MODELS_DIR)
