"""
Demo end-to-end: Autos + Subsídios -> IFP v2 + AutosFeatures -> Motor -> Recomendação.

Roda nos dois casos-exemplo e salva decisão em docs/examples/decisao_caso_*.json.

Uso:
    python src/demo_motor.py
"""

from __future__ import annotations

import json
from pathlib import Path

from extractors import extract_autos
from ifp_v2 import compute_ifp_v2
from motor_decisao import decidir

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "examples"

CASES = [
    (ROOT / "data" / "Caso_01", "0801234-56.2024.8.10.0001"),
    (ROOT / "data" / "Caso_02", "0654321-09.2024.8.04.0001"),
]


def _find_autos_pdf(pasta: Path) -> Path:
    for pdf in sorted(pasta.glob("*.pdf")):
        if pdf.name.lower().startswith("01_autos") or "autos" in pdf.name.lower():
            return pdf
    raise FileNotFoundError(f"Nenhum PDF de Autos em {pasta}")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for pasta, processo_id in CASES:
        print(f"\n{'=' * 78}\n{pasta.name} ({processo_id})\n{'=' * 78}")

        print("-> Extraindo petição inicial (Autos)...")
        autos = extract_autos(_find_autos_pdf(pasta))
        print(f"  Valor da causa: R$ {autos.valor_causa:,.2f}" if autos.valor_causa else "  Valor da causa: n/a")
        print(f"  Tipo de alegação: {autos.tipo_alegacao}")
        print(f"  UF comarca: {autos.uf_comarca}")

        print("-> Calculando IFP v2 (subsídios)...")
        ifp = compute_ifp_v2(pasta, processo_id=processo_id)
        print(f"  IFP: {ifp['ifp']['score']} ({ifp['ifp']['tier']})")

        print("-> Aplicando motor de decisão...")
        dec = decidir(ifp, autos)
        print(f"\n  >> DECISÃO: {dec['decisao']} ({dec['confianca']})")
        if dec["valor_sugerido"]:
            print(f"  >> Valor sugerido: R$ {dec['valor_sugerido']['proposta_acordo']:,.2f}")
        print(f"\n  Racional: {dec['racional']}")

        combined = {
            "processo_id": processo_id,
            "autos_features": autos.model_dump(),
            "ifp": ifp,
            "decisao": dec,
        }
        out_path = OUT_DIR / f"decisao_{pasta.name.lower()}.json"
        out_path.write_text(
            json.dumps(combined, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        print(f"\n  Salvo em: {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
