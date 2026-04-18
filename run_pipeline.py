"""Roda o motor de decisao em todos os JSONs de extraction_output/."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from src.backend.modelo.features import TargetEncodingStats
from src.backend.modelo.motor_decisao import MotorDecisao

sys.modules["__main__"].TargetEncodingStats = TargetEncodingStats

ROOT = Path(__file__).resolve().parent
EXTRACTION_DIR = ROOT / "extraction_output"


def fmt_brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def main() -> None:
    motor = MotorDecisao.carregar(policy="Balanceada")
    print("=" * 80)
    print(f"Motor carregado | Politica: {motor.policy}")
    print(f"  alpha = {motor.alpha:.2f} | Limiar = {fmt_brl(motor.limiar)} | Cp = {fmt_brl(motor.cp)}")
    print("=" * 80)

    jsons = sorted(EXTRACTION_DIR.glob("*.json"))
    print(f"\nProcessos encontrados: {len(jsons)}\n")

    for path in jsons:
        with path.open(encoding="utf-8") as f:
            payload = json.load(f)

        r = motor.decidir(
            uf=payload["uf"],
            sub_assunto=payload["sub_assunto"],
            valor_causa=payload["valor_causa"],
            features_documentais=payload.get("features_documentais"),
        )

        print("-" * 80)
        print(f"Processo: {payload['processo_id']}")
        print(f"  UF={payload['uf']} | Sub-assunto={payload['sub_assunto']} | Valor causa={fmt_brl(payload['valor_causa'])}")
        fd = payload.get("features_documentais") or {}
        if fd:
            presencas = [k.replace("tem_", "") for k in ("tem_contrato","tem_extrato","tem_comprovante","tem_dossie","tem_demonstrativo","tem_laudo") if fd.get(k)]
            print(f"  Docs presentes: {', '.join(presencas) if presencas else '(nenhum)'}")
            print(f"  IFP={fd.get('ifp'):.2f} | score_fraude={fd.get('score_fraude'):.2f} | laudo_favoravel={fd.get('laudo_favoravel')} | indicio_fraude={fd.get('indicio_de_fraude')}")
        print()
        print(f"  >>> DECISAO: {r.decisao.value}")
        if r.override_aplicado:
            print(f"      (override: {r.razao_override.value if r.razao_override else '?'})")
        print(f"      P(perda)          = {r.probabilidade_perda:.3f}")
        print(f"      Vc esperado       = {fmt_brl(r.valor_condenacao_estimado)}")
        q10, q90 = r.valor_condenacao_faixa
        print(f"      Vc IC 80%         = [{fmt_brl(q10)}, {fmt_brl(q90)}]")
        print(f"      E[C_defesa]       = {fmt_brl(r.custo_esperado_defesa)}")
        if r.valor_acordo_sugerido is not None:
            print(f"      V_acordo sugerido = {fmt_brl(r.valor_acordo_sugerido)}")
        print()
        print(f"  Explicacao: {r.explicacao}")
        print()


if __name__ == "__main__":
    main()
