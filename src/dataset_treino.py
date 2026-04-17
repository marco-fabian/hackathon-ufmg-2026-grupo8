"""
Monta o dataset de treino para o motor de decisão.

Junta, por processo_id:
- Outcomes reais (resultado macro/micro, valor_causa, valor_cond)
- Presença dos 6 subsídios
- IFP v1 (score e tier)
- Split estratificado train/val (80/20) pelo resultado macro

Saída: data/training.csv (não versionado; gerado localmente pelo colega
responsável pelo motor de decisão).

Uso:
    python src/dataset_treino.py
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ifp_v1_heuristico import PESOS, compute_ifp_v1

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "data" / "Hackaton_Enter_Base_Candidatos.xlsx"
OUT = ROOT / "data" / "training.csv"

SEED = 42
VAL_FRAC = 0.20


def build() -> pd.DataFrame:
    resultados = pd.read_excel(XLSX, sheet_name="Resultados dos processos")
    resultados.columns = [
        "processo_id", "uf", "assunto", "sub_assunto",
        "res_macro", "res_micro", "valor_causa", "valor_cond",
    ]

    subsidios = pd.read_excel(XLSX, sheet_name="Subsídios disponibilizados", header=1)
    subsidios.columns = ["processo_id"] + list(PESOS.keys())

    df = resultados.merge(subsidios, on="processo_id", how="inner")
    assert len(df) == len(resultados), "Merge perdeu linhas — conferir chaves"

    ifp_rows = []
    for _, row in df[list(PESOS.keys())].iterrows():
        r = compute_ifp_v1({doc: bool(row[doc]) for doc in PESOS})
        ifp_rows.append({"ifp_score": r["score"], "ifp_tier": r["tier"]})
    ifp_df = pd.DataFrame(ifp_rows, index=df.index)
    df = pd.concat([df, ifp_df], axis=1)

    df["qtd_docs"] = df[list(PESOS.keys())].sum(axis=1)
    df["banco_ganhou"] = (df["res_macro"] == "Êxito").astype(int)
    df["houve_condenacao"] = (df["valor_cond"] > 0).astype(int)

    df = df.drop(columns=["assunto"])
    df = df.rename(columns={doc: f"tem_{doc}" for doc in PESOS})

    df["split"] = "train"
    val_idx = (
        df.groupby("res_macro", group_keys=False)
        .apply(lambda g: g.sample(frac=VAL_FRAC, random_state=SEED))
        .index
    )
    df.loc[val_idx, "split"] = "val"

    cols = [
        "processo_id", "uf", "sub_assunto",
        "valor_causa", "valor_cond",
        "res_macro", "res_micro",
        "banco_ganhou", "houve_condenacao",
        *[f"tem_{doc}" for doc in PESOS],
        "qtd_docs",
        "ifp_score", "ifp_tier",
        "split",
    ]
    return df[cols]


def main() -> None:
    df = build()
    print(f"Dataset montado: {len(df)} linhas, {len(df.columns)} colunas")
    print("\nSplit:")
    print(df["split"].value_counts().to_string())
    print("\nTaxa de êxito por split (sanity check — deve ser ~igual):")
    print(df.groupby("split")["banco_ganhou"].mean().round(3).to_string())
    print("\nIFP tier × banco_ganhou:")
    print(pd.crosstab(df["ifp_tier"], df["banco_ganhou"], normalize="index").round(3).to_string())
    df.to_csv(OUT, index=False)
    print(f"\nSalvo em: {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
