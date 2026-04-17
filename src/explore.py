"""
Exploração da base do hackathon Enter — Grupo 8.

Roda análises sobre data/Hackaton_Enter_Base_Candidatos.xlsx e imprime no
stdout os achados que alimentam a calibração do IFP. É a fonte única de
verdade para os números que aparecem no CLAUDE.md e no ADR 0001.

Uso:
    python src/explore.py
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "data" / "Hackaton_Enter_Base_Candidatos.xlsx"

DOC_COLS = ["contrato", "extrato", "comprovante", "dossie", "demonstrativo", "laudo"]


def load() -> pd.DataFrame:
    resultados = pd.read_excel(XLSX, sheet_name="Resultados dos processos")
    resultados.columns = [
        "processo", "uf", "assunto", "sub_assunto",
        "res_macro", "res_micro", "valor_causa", "valor_cond",
    ]

    subsidios = pd.read_excel(XLSX, sheet_name="Subsídios disponibilizados", header=1)
    subsidios.columns = ["processo"] + DOC_COLS

    df = resultados.merge(subsidios, on="processo", how="inner")
    df["qtd_docs"] = df[DOC_COLS].sum(axis=1)
    df["banco_ganhou"] = (df["res_macro"] == "Êxito").astype(int)
    return df


def section(title: str) -> None:
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def distribuicao_outcome(df: pd.DataFrame) -> None:
    section("Distribuição de outcome")
    print("\nResultado macro:")
    print(df["res_macro"].value_counts(dropna=False).to_string())
    print("\nResultado micro:")
    print(df["res_micro"].value_counts(dropna=False).to_string())
    print("\nSub-assunto × êxito:")
    print(
        df.groupby("sub_assunto")["banco_ganhou"]
        .agg(["count", "mean"])
        .round(3)
        .to_string()
    )


def lift_por_documento(df: pd.DataFrame) -> None:
    section("Lift por documento (taxa de êxito com vs sem)")
    print(f"\n{'documento':<14} {'com':>7} {'n_com':>7} {'sem':>7} {'n_sem':>7} {'lift (pp)':>10}")
    for doc in DOC_COLS:
        com = df[df[doc] == 1]
        sem = df[df[doc] == 0]
        p_com, p_sem = com["banco_ganhou"].mean(), sem["banco_ganhou"].mean()
        lift = (p_com - p_sem) * 100
        print(f"{doc:<14} {p_com:>7.3f} {len(com):>7d} {p_sem:>7.3f} {len(sem):>7d} {lift:>+10.1f}")


def escada_qtd_docs(df: pd.DataFrame) -> None:
    section("Taxa de êxito e condenação média por qtd de docs")
    agg = df.groupby("qtd_docs").agg(
        n=("processo", "count"),
        pct_exito=("banco_ganhou", "mean"),
        valor_cond_medio=("valor_cond", "mean"),
    ).round(3)
    print(agg.to_string())


def combos_top(df: pd.DataFrame, k: int = 10) -> None:
    section(f"Top {k} combinações de subsídios (ordem: {DOC_COLS})")
    df = df.copy()
    df["combo"] = df[DOC_COLS].astype(int).astype(str).agg("".join, axis=1)
    stats = (
        df.groupby("combo")
        .agg(n=("processo", "count"), pct_exito=("banco_ganhou", "mean"))
        .sort_values("n", ascending=False)
        .head(k)
        .round(3)
    )
    print(stats.to_string())


def valor_causa_vs_condenacao(df: pd.DataFrame) -> None:
    section("Valor da causa e condenação")
    print("\nValor da causa (geral):")
    print(df["valor_causa"].describe().round(2).to_string())
    perdeu = df[df["res_macro"] == "Não Êxito"]
    print(f"\nValor da condenação (só quando banco perdeu, n={len(perdeu)}):")
    print(perdeu["valor_cond"].describe().round(2).to_string())
    print(f"\nRazão condenação/causa média (quando perde): "
          f"{(perdeu['valor_cond'] / perdeu['valor_causa']).mean():.3f}")


def main() -> None:
    if not XLSX.exists():
        raise SystemExit(f"Arquivo não encontrado: {XLSX}")
    df = load()
    print(f"Base carregada: {len(df)} processos.")
    distribuicao_outcome(df)
    lift_por_documento(df)
    escada_qtd_docs(df)
    combos_top(df)
    valor_causa_vs_condenacao(df)


if __name__ == "__main__":
    main()
