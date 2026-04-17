"""Feature engineering para os modelos A e B.

Pipeline reproduzivel usado no treino e na inferencia. Salva o OrdinalEncoder
e as estatisticas de target encoding para que a inferencia use exatamente a
mesma transformacao.

Features usadas:
  - Categoricas: UF, Sub-assunto (OrdinalEncoder)
  - Numericas:   Valor da causa
  - Derivadas:   log_valor_causa, valor_causa_bin (tercis)
  - Target enc:  uf_taxa_perda_hist, uf_ticket_medio_cond (smoothed, fit so no treino)
  - Presenca:    tem_contrato, tem_extrato, tem_comprovante, tem_dossie,
                 tem_demonstrativo, tem_laudo (aba 2 do xlsx)
  - Agregada:    qtd_docs (soma das 6 flags)
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
    """Le as duas abas e retorna o df mesclado com os 6 booleanos + qtd_docs."""
    df = pd.read_excel(path, sheet_name=cfg.SHEET_RESULTADOS)
    df.columns = [c.strip() for c in df.columns]

    subs = pd.read_excel(path, sheet_name=cfg.SHEET_SUBSIDIOS, header=1)
    subs.columns = [c.strip() for c in subs.columns]
    col_chave_subs = next(c for c in subs.columns if "rocesso" in c)
    subs = subs.rename(columns={col_chave_subs: cfg.COL_NUM_PROCESSO, **cfg.SUBSIDIOS_COL_MAP})

    cols_flags = cfg.FEATURES_BOOLEANAS
    subs[cols_flags] = subs[cols_flags].astype(int)

    df = df.merge(subs[[cfg.COL_NUM_PROCESSO] + cols_flags], on=cfg.COL_NUM_PROCESSO, how="left")
    if df[cols_flags].isna().any().any():
        raise ValueError("Merge com aba 2 deixou nulos em flags - chaves nao alinham.")

    df["qtd_docs"] = df[cols_flags].sum(axis=1)
    if df.drop(columns=["qtd_docs"]).isna().any().any():
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

    for col in cfg.FEATURES_BOOLEANAS:
        X[col] = df[col].astype(int).values
    X["qtd_docs"] = df["qtd_docs"].astype(int).values

    return X, encoder, stats


def build_features_single(
    uf: str,
    sub_assunto: str,
    valor_causa: float,
    encoder: OrdinalEncoder,
    stats: TargetEncodingStats,
    valor_causa_bins: tuple[float, float],
    subsidios: Optional[dict] = None,
) -> pd.DataFrame:
    """Transforma um unico processo em DataFrame de 1 linha pronto para predicao.

    `subsidios` e um dict com chaves em FEATURES_BOOLEANAS. Flags ausentes
    sao tratadas como 0 (subsidio nao fornecido - alinhado com a base).
    """
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

    subsidios = subsidios or {}
    qtd = 0
    for col in cfg.FEATURES_BOOLEANAS:
        val = int(bool(subsidios.get(col, False)))
        X[col] = val
        qtd += val
    X["qtd_docs"] = qtd
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


def salvar_banco_treino(
    df_train: pd.DataFrame,
    df_test: pd.DataFrame,
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
) -> None:
    """Gera data/banco_treino.csv com as colunas originais + booleanas + engineered."""
    def _combinar(df_orig: pd.DataFrame, X: pd.DataFrame, split: str) -> pd.DataFrame:
        out = df_orig[[
            cfg.COL_NUM_PROCESSO, cfg.COL_UF, "Assunto", cfg.COL_SUB_ASSUNTO,
            cfg.COL_VALOR_CAUSA, cfg.COL_VALOR_CONDENACAO,
            cfg.COL_RESULTADO_MACRO, "Resultado micro",
            *cfg.FEATURES_BOOLEANAS, "qtd_docs", "perde",
        ]].reset_index(drop=True).copy()
        eng = X[["log_valor_causa", "valor_causa_bin", "uf_taxa_perda_hist",
                 "uf_ticket_medio_cond"]].reset_index(drop=True)
        out = pd.concat([out, eng], axis=1)
        out["split"] = split
        return out

    combinado = pd.concat([
        _combinar(df_train, X_train, "train"),
        _combinar(df_test, X_test, "test"),
    ], ignore_index=True)
    combinado.to_csv(cfg.BANCO_TREINO_CSV_PATH, index=False, encoding="utf-8")
    print(f"Snapshot salvo em: {cfg.BANCO_TREINO_CSV_PATH} ({len(combinado):,} linhas, {len(combinado.columns)} cols)")


if __name__ == "__main__":
    df = carregar_base()
    print(f"Base carregada: {len(df)} linhas")
    print(f"Taxa de perda: {df['perde'].mean():.1%}")
    print(f"Flags presenca (mean): {df[cfg.FEATURES_BOOLEANAS].mean().to_dict()}")
    df_train, df_test = split_treino_teste(df)
    print(f"Treino: {len(df_train)} | Teste: {len(df_test)}")

    X_train, encoder, stats = build_features(df_train)
    X_test, _, _ = build_features(df_test, encoder=encoder, stats=stats)

    bins = calcular_bins_valor_causa(df_train[cfg.COL_VALOR_CAUSA])
    salvar_artefatos_features(encoder, stats, bins)
    salvar_banco_treino(df_train, df_test, X_train, X_test)

    print(f"\nFeatures montadas: {list(X_train.columns)}")
    print(f"Shape X_train: {X_train.shape} | X_test: {X_test.shape}")
    print(f"\nEstatisticas globais:")
    print(f"  Taxa perda global = {stats.taxa_perda_global:.4f}")
    print(f"  Condenacao mediana (perdas) = R$ {stats.condenacao_mediana_global:,.2f}")
    print(f"  Bins valor_causa: {bins}")
    print("\nArtefatos salvos em:", cfg.MODELS_DIR)
