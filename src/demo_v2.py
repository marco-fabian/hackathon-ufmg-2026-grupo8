"""
Demo do IFP v2 — roda nos dois casos-exemplo e salva o JSON em docs/examples/.

Uso:
    python src/demo_v2.py
"""

from __future__ import annotations

import json
from pathlib import Path

from ifp_v2 import compute_ifp_v2

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "examples"

CASES = [
    (ROOT / "data" / "Caso_01", "0801234-56.2024.8.10.0001"),
    (ROOT / "data" / "Caso_02", "0654321-09.2024.8.04.0001"),
]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for pasta, processo_id in CASES:
        print(f"\n{'=' * 78}\nProcessando {pasta.name} ({processo_id})\n{'=' * 78}")
        result = compute_ifp_v2(pasta, processo_id=processo_id)

        ifp = result["ifp"]
        print(f"\nIFP: {ifp['score']} ({ifp['tier']}) | "
              f"presença {ifp['componentes']['presenca']}/60 + "
              f"qualidade {ifp['componentes']['qualidade']}/40")
        print(f"Reasoning: {result['reasoning_curto']}")

        print("\nSinais fortes encontrados:")
        for s in result["sinais_fortes"]:
            print(f"  + {s}")
        if not result["sinais_fortes"]:
            print("  (nenhum)")

        if result["sinais_ausentes"]:
            print("\nSubsídios ausentes:")
            for s in result["sinais_ausentes"]:
                print(f"  - {s}")

        out_path = OUT_DIR / f"ifp_v2_{pasta.name.lower()}.json"
        out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nSalvo em: {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
