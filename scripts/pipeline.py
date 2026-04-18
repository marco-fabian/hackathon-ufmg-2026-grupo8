"""Pipeline end-to-end de um processo judicial.

Recebe uma pasta com todos os PDFs do processo, roda:
  1. Extrator de features dos PDFs (autos + 6 subsidios via LLM)
  2. Calculo do IFP v2 (presenca 0-60 + qualidade 0-40)
  3. Agente de analise de fraude (calibra score_fraude via LLM)
  4. Motor de decisao para as 5 politicas (Conservadora -> Maxima)

Gera um JSON estruturado por processo, pronto para consumo do front-end,
com header + IFP + metricas do modelo + bloco por politica.

Uso:
    python scripts/pipeline.py data/Caso_01
    python scripts/pipeline.py data/Caso_01 --out scripts/output/caso_01.json
    python scripts/pipeline.py data/Caso_01 --processo-id 0801234-56.2024.8.10.0001
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
for p in (str(SRC), str(ROOT)):
    if p not in sys.path:
        sys.path.insert(0, p)

from src.backend.modelo.features import TargetEncodingStats  # noqa: E402
sys.modules["__main__"].TargetEncodingStats = TargetEncodingStats  # type: ignore[attr-defined]

from agentes import analisar_fraude  # noqa: E402
from extractors import extract_autos  # noqa: E402
from ifp_v2 import compute_ifp_v2  # noqa: E402
from src.backend.modelo import config as cfg  # noqa: E402
from src.backend.modelo.adaptador_ifp import ifp_to_features_doc  # noqa: E402
from src.backend.modelo.motor_decisao import MotorDecisao  # noqa: E402

OUTPUT_DIR_DEFAULT = ROOT / "scripts" / "output"


def _achar_autos(pasta: Path) -> Path:
    for pdf in sorted(pasta.glob("*.pdf")):
        nome = pdf.name.lower()
        if nome.startswith("01_autos") or "autos" in nome:
            return pdf
    raise FileNotFoundError(f"Nenhum PDF de Autos em {pasta}")


def _extrair_insumos(pasta: Path, processo_id: str) -> dict[str, Any]:
    """Roda extractors + IFP + analise de fraude. Retorna o dict consolidado."""
    autos = extract_autos(_achar_autos(pasta))
    ifp = compute_ifp_v2(pasta, processo_id=processo_id)
    analise = analisar_fraude(autos.model_dump(), ifp)

    features_doc = ifp_to_features_doc(ifp)
    features_doc["score_fraude"] = round(analise.score_fraude, 3)

    return {
        "autos": autos,
        "ifp": ifp,
        "analise_fraude": analise,
        "features_documentais": features_doc,
    }


def _bloco_politica(motor: MotorDecisao, uf: str, sub: str, valor: float, fd: dict) -> dict[str, Any]:
    r = motor.decidir(uf=uf, sub_assunto=sub, valor_causa=valor, features_documentais=fd)
    q10, q90 = r.valor_condenacao_faixa
    economia_esperada = None
    if r.valor_acordo_sugerido is not None:
        economia_esperada = round(
            r.taxa_aceite_estimada * (r.custo_esperado_defesa - r.valor_acordo_sugerido), 2
        )
    return {
        "policy": r.policy,
        "alpha": round(r.alpha_aplicado, 3),
        "alpha_quantil": r.alpha_quantil,
        "taxa_aceite_estimada": r.taxa_aceite_estimada,
        "alphas_por_quantil": {str(q): round(a, 3) for q, a in r.alphas_por_quantil.items()},
        "limiar": r.limiar_aplicado,
        "decisao": r.decisao.value,
        "override_aplicado": r.override_aplicado,
        "razao_override": r.razao_override.value if r.override_aplicado else None,
        "probabilidade_perda": round(r.probabilidade_perda, 4),
        "valor_condenacao_estimado": round(r.valor_condenacao_estimado, 2),
        "valor_condenacao_faixa_ic80": {
            "q10": round(q10, 2),
            "q90": round(q90, 2),
        },
        "custo_processual_cp": round(r.custo_processual, 2),
        "custo_esperado_defesa": round(r.custo_esperado_defesa, 2),
        "valor_acordo_sugerido": round(r.valor_acordo_sugerido, 2) if r.valor_acordo_sugerido is not None else None,
        "economia_esperada_vs_defesa": economia_esperada,
        "explicacao": r.explicacao,
    }


def processar_processo(pasta_processo: Path, processo_id: str | None = None) -> dict[str, Any]:
    pasta = Path(pasta_processo)
    processo_id = processo_id or pasta.name

    insumos = _extrair_insumos(pasta, processo_id)
    autos = insumos["autos"]
    ifp = insumos["ifp"]
    analise = insumos["analise_fraude"]
    features_doc = insumos["features_documentais"]

    politicas_nomes = list(cfg.POLICIES_ALVO.keys())
    politicas_resultado: dict[str, Any] = {}
    for nome in politicas_nomes:
        motor = MotorDecisao.carregar(policy=nome)
        politicas_resultado[nome] = _bloco_politica(
            motor, autos.uf, autos.sub_assunto, autos.valor_causa, features_doc
        )

    return {
        "header": {
            "processo_id": processo_id,
            "uf": autos.uf,
            "sub_assunto": autos.sub_assunto,
            "valor_causa": autos.valor_causa,
        },
        "ifp": {
            "score": ifp["ifp"]["score"],
            "score_normalizado": round(ifp["ifp"]["score"] / 100.0, 3),
            "tier": ifp["ifp"]["tier"],
            "componentes": ifp["ifp"]["componentes"],
            "sinais_fortes": ifp["sinais_fortes"],
            "sinais_ausentes": ifp["sinais_ausentes"],
            "reasoning": ifp["reasoning_curto"],
        },
        "features_documentais": features_doc,
        "analise_fraude": analise.model_dump(),
        "politicas": politicas_resultado,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pasta_processo", type=Path, help="Pasta com todos os PDFs do processo")
    parser.add_argument("--processo-id", default=None, help="Override do ID (default: nome da pasta)")
    parser.add_argument("--out", type=Path, default=None, help="Caminho do JSON de saida")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    if not args.pasta_processo.is_dir():
        raise SystemExit(f"Pasta nao encontrada: {args.pasta_processo}")

    resultado = processar_processo(args.pasta_processo, args.processo_id)

    out_path = args.out
    if out_path is None:
        OUTPUT_DIR_DEFAULT.mkdir(parents=True, exist_ok=True)
        out_path = OUTPUT_DIR_DEFAULT / f"{resultado['header']['processo_id']}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"Processo: {resultado['header']['processo_id']}")
    print(f"  UF={resultado['header']['uf']} | Sub={resultado['header']['sub_assunto']} | Valor={resultado['header']['valor_causa']:.2f}")
    print(f"  IFP={resultado['ifp']['score']}/100 ({resultado['ifp']['tier']})")
    print(f"  Politicas: {list(resultado['politicas'].keys())}")
    print(f"\nDecisoes por politica:")
    for nome, bloco in resultado["politicas"].items():
        tag = " [override]" if bloco["override_aplicado"] else ""
        v_acordo = bloco["valor_acordo_sugerido"]
        v_str = f"R$ {v_acordo:,.2f}" if v_acordo is not None else "-"
        print(f"  {nome:<14} -> {bloco['decisao']:<7} | V_acordo={v_str}{tag}")
    print(f"\nSalvo em: {out_path}")


if __name__ == "__main__":
    main()
