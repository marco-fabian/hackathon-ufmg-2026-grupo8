"""
Demo end-to-end: roda o pipeline completo nos 2 casos-exemplo, salva o
payload do contrato-extrator em extraction_output/ e imprime a decisão do
motor.

Uso:
    python src/demo_pipeline.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.backend.modelo.motor_decisao import MotorDecisao  # noqa: E402
from src.pipeline import processar_caso  # noqa: E402


OUT_EXTRACTOR = ROOT / "extraction_output"
OUT_EXAMPLES = ROOT / "docs" / "examples"

CASES = [
    (ROOT / "data" / "Caso_01", "0801234-56.2024.8.10.0001"),
    (ROOT / "data" / "Caso_02", "0654321-09.2024.8.04.0001"),
]


def main() -> None:
    OUT_EXTRACTOR.mkdir(exist_ok=True)
    OUT_EXAMPLES.mkdir(parents=True, exist_ok=True)

    motor = MotorDecisao.carregar()
    print(f"Motor carregado (policy={motor.policy})\n")

    for pasta, processo_id in CASES:
        print("=" * 78)
        print(f"{pasta.name} ({processo_id})")
        print("=" * 78)

        r = processar_caso(pasta, processo_id=processo_id, motor=motor)

        payload = r["payload"]
        analise = r["analise_fraude"]
        decisao = r["decisao"]

        print(f"\n[Autos]  uf={payload['uf']}  "
              f"sub_assunto={payload['sub_assunto']}  "
              f"valor_causa=R$ {payload['valor_causa']:,.2f}")
        print(f"[IFP]    score={r['ifp']['ifp']['score']} "
              f"({r['ifp']['ifp']['tier']})")
        print(f"[Fraude] score={analise['score_fraude']:.3f}")
        print(f"         indicadores: {analise['indicadores_fraude']}")
        print(f"         protetivos:  {analise['sinais_protetivos']}")
        print(f"         {analise['justificativa']}")

        print(f"\n[MOTOR]  DECISAO: {decisao['decisao']} "
              f"(override={decisao['override_aplicado']})")
        if decisao['valor_acordo_sugerido'] is not None:
            print(f"         valor_acordo_sugerido: "
                  f"R$ {decisao['valor_acordo_sugerido']:,.2f}")
        print(f"         p_perda={decisao['probabilidade_perda']:.3f}  "
              f"vc_estimado=R$ {decisao['valor_condenacao_estimado']:,.2f}  "
              f"faixa={tuple(round(x) for x in decisao['valor_condenacao_faixa'])}")
        if decisao['razao_override']:
            print(f"         razao_override: {decisao['razao_override']}")

        # Salva o payload do contrato-extrator (formato que o colega consome)
        out_payload = OUT_EXTRACTOR / f"{processo_id}.json"
        out_payload.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        # Salva snapshot completo para rastreabilidade
        out_full = OUT_EXAMPLES / f"pipeline_{pasta.name.lower()}.json"
        out_full.write_text(
            json.dumps(r, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )

        print(f"\n-> {out_payload.relative_to(ROOT)}")
        print(f"-> {out_full.relative_to(ROOT)}\n")


if __name__ == "__main__":
    main()
