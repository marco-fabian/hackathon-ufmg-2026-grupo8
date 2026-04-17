"""
IFP v1 — Índice de Força Probatória (versão heurística, presença-based).

Calcula um score 0–100 a partir da presença/ausência dos 6 subsídios do
Banco UFMG. Não consome LLM nem lê PDFs — roda em segundos sobre os 60k
processos da base.

Pesos e tiers definidos em docs/decisions/0001-ifp-v1-design.md.

Uso:
    # Batch sobre a base
    python src/ifp_v1_heuristico.py

    # Import em outro módulo
    from ifp_v1_heuristico import compute_ifp_v1
    compute_ifp_v1({"contrato": True, "extrato": True, ...})
"""

from __future__ import annotations

from pathlib import Path
from typing import Mapping, TypedDict

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "data" / "Hackaton_Enter_Base_Candidatos.xlsx"
OUT_CSV = ROOT / "data" / "ifp_v1.csv"

PESOS: dict[str, int] = {
    "contrato": 22,
    "extrato": 22,
    "comprovante": 15,
    "demonstrativo": 12,
    "dossie": 14,
    "laudo": 15,
}
assert sum(PESOS.values()) == 100, "Pesos do IFP v1 devem somar 100"

TIER_FORTE_MIN = 75
TIER_MEDIO_MIN = 50


class SubsidioBreakdown(TypedDict):
    presente: bool
    peso_aplicado: int


class IFPResult(TypedDict):
    score: int
    tier: str
    versao: str
    subsidios: dict[str, SubsidioBreakdown]
    sinais_ausentes: list[str]
    reasoning_curto: str


def _tier(score: int) -> str:
    if score >= TIER_FORTE_MIN:
        return "FORTE"
    if score >= TIER_MEDIO_MIN:
        return "MÉDIO"
    return "FRACO"


def compute_ifp_v1(subsidios: Mapping[str, bool]) -> IFPResult:
    """Calcula o IFP v1 a partir de um dict {nome_doc: presente_bool}.

    Chaves ausentes no dict são tratadas como não-presentes.
    """
    breakdown: dict[str, SubsidioBreakdown] = {}
    score = 0
    ausentes: list[str] = []
    for doc, peso in PESOS.items():
        presente = bool(subsidios.get(doc, False))
        aplicado = peso if presente else 0
        score += aplicado
        breakdown[doc] = {"presente": presente, "peso_aplicado": aplicado}
        if not presente:
            ausentes.append(doc)

    qtd = len(PESOS) - len(ausentes)
    if ausentes:
        falta_str = ", ".join(ausentes)
        reasoning = f"{qtd} de {len(PESOS)} subsídios presentes; falta: {falta_str}."
    else:
        reasoning = "Todos os 6 subsídios presentes."

    return {
        "score": score,
        "tier": _tier(score),
        "versao": "v1",
        "subsidios": breakdown,
        "sinais_ausentes": ausentes,
        "reasoning_curto": reasoning,
    }


def batch_over_xlsx() -> pd.DataFrame:
    """Roda o IFP v1 sobre todos os 60k processos e retorna um DataFrame."""
    subsidios_df = pd.read_excel(
        XLSX, sheet_name="Subsídios disponibilizados", header=1
    )
    subsidios_df.columns = ["processo"] + list(PESOS.keys())

    rows = []
    for _, row in subsidios_df.iterrows():
        presenca = {doc: bool(row[doc]) for doc in PESOS}
        result = compute_ifp_v1(presenca)
        rows.append({
            "processo": row["processo"],
            "ifp_score": result["score"],
            "ifp_tier": result["tier"],
            **{f"tem_{doc}": presenca[doc] for doc in PESOS},
            "sinais_ausentes": ",".join(result["sinais_ausentes"]),
        })
    return pd.DataFrame(rows)


def _sanity_check() -> None:
    """Valida os dois casos-exemplo contra os valores esperados do ADR."""
    caso_01 = {d: True for d in PESOS}
    r1 = compute_ifp_v1(caso_01)
    assert r1["score"] == 100 and r1["tier"] == "FORTE", f"Caso_01 esperado 100 FORTE, veio {r1['score']} {r1['tier']}"

    caso_02 = {
        "contrato": False, "extrato": False, "dossie": False,
        "comprovante": True, "demonstrativo": True, "laudo": True,
    }
    r2 = compute_ifp_v1(caso_02)
    assert r2["score"] == 42 and r2["tier"] == "FRACO", f"Caso_02 esperado 42 FRACO, veio {r2['score']} {r2['tier']}"
    print("Sanity check OK — Caso_01 IFP=100 FORTE, Caso_02 IFP=42 FRACO")


def main() -> None:
    _sanity_check()
    print(f"\nRodando IFP v1 em batch sobre {XLSX.name}...")
    df = batch_over_xlsx()
    print(f"Calculados {len(df)} processos.")
    print("\nDistribuição de tiers:")
    print(df["ifp_tier"].value_counts().to_string())
    print("\nScore:")
    print(df["ifp_score"].describe().round(2).to_string())
    OUT_CSV.parent.mkdir(exist_ok=True)
    df.to_csv(OUT_CSV, index=False)
    print(f"\nOutput salvo em: {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
