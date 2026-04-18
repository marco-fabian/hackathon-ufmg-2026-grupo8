"""Exporta a base Excel para JSON estatico consumido pelo frontend."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_PATH    = PROJECT_ROOT / "data" / "Hackaton_Enter_Base_Candidatos.xlsx"
OUTPUT_PATH  = PROJECT_ROOT / "src" / "frontend" / "public" / "processos.json"

df = pd.read_excel(DATA_PATH, sheet_name="Resultados dos processos")
df.columns = [c.strip() for c in df.columns]

records = [
    {
        "numeroCaso":      str(row["Número do processo"]),
        "uf":              str(row["UF"]),
        "subAssunto":      str(row["Sub-assunto"]),
        "resultadoMacro":  str(row["Resultado macro"]),
        "resultadoMicro":  str(row["Resultado micro"]),
        "valorCausa":      round(float(row["Valor da causa"] or 0), 2),
        "valorCondenacao": round(float(row["Valor da condenação/indenização"] or 0), 2),
    }
    for _, row in df.iterrows()
]

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, separators=(",", ":"))

print(f"Exportado: {len(records)} processos -> {OUTPUT_PATH}")
