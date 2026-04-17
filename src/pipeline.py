"""
Pipeline end-to-end: pasta de processo -> payload do contrato-extrator ->
decisão do motor.

Fluxo:
  1. extract_autos(01_Autos_*.pdf)          -> uf, sub_assunto, valor_causa
  2. compute_ifp_v2(pasta)                  -> IFP rico (6 subsídios)
  3. analisar_fraude(autos, ifp)            -> score_fraude calibrado (LLM)
  4. ifp_to_features_doc(ifp)               -> features_documentais
     + sobrescrever score_fraude pelo agente
  5. MotorDecisao.decidir(...)              -> decisão + valor de acordo
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, TypedDict

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
for p in (str(SRC), str(ROOT)):
    if p not in sys.path:
        sys.path.insert(0, p)

# Shim para compatibilidade com os .joblib do motor: o pickle referencia
# TargetEncodingStats em __main__ (o script que treinou), não no módulo
# features. Registramos a classe em __main__ antes do joblib.load.
from src.backend.modelo.features import TargetEncodingStats  # noqa: E402
sys.modules["__main__"].TargetEncodingStats = TargetEncodingStats  # type: ignore[attr-defined]

from agentes import AnaliseFraude, analisar_fraude  # noqa: E402
from extractors import AutosFeatures, extract_autos  # noqa: E402
from ifp_v2 import compute_ifp_v2  # noqa: E402
from src.backend.modelo.adaptador_ifp import ifp_to_features_doc  # noqa: E402
from src.backend.modelo.motor_decisao import MotorDecisao  # noqa: E402


class PayloadExtrator(TypedDict):
    processo_id: str
    uf: str
    sub_assunto: str
    valor_causa: float
    features_documentais: dict[str, Any]


class ResultadoPipeline(TypedDict):
    processo_id: str
    payload: PayloadExtrator
    analise_fraude: dict[str, Any]
    ifp: dict[str, Any]
    decisao: dict[str, Any]


def _achar_autos(pasta: Path) -> Path:
    for pdf in sorted(pasta.glob("*.pdf")):
        nome = pdf.name.lower()
        if nome.startswith("01_autos") or "autos" in nome:
            return pdf
    raise FileNotFoundError(f"Nenhum PDF de Autos em {pasta}")


def processar_caso(
    pasta_processo: Path,
    processo_id: str | None = None,
    motor: MotorDecisao | None = None,
) -> ResultadoPipeline:
    pasta = Path(pasta_processo)
    processo_id = processo_id or pasta.name

    autos: AutosFeatures = extract_autos(_achar_autos(pasta))
    ifp = compute_ifp_v2(pasta, processo_id=processo_id)

    analise: AnaliseFraude = analisar_fraude(autos.model_dump(), ifp)

    features_doc = ifp_to_features_doc(ifp)
    features_doc["score_fraude"] = round(analise.score_fraude, 3)

    payload: PayloadExtrator = {
        "processo_id": processo_id,
        "uf": autos.uf,
        "sub_assunto": autos.sub_assunto,
        "valor_causa": autos.valor_causa,
        "features_documentais": features_doc,
    }

    if motor is None:
        motor = MotorDecisao.carregar()

    resultado = motor.decidir(
        uf=payload["uf"],
        sub_assunto=payload["sub_assunto"],
        valor_causa=payload["valor_causa"],
        features_documentais=payload["features_documentais"],
    )

    return {
        "processo_id": processo_id,
        "payload": payload,
        "analise_fraude": analise.model_dump(),
        "ifp": ifp,
        "decisao": {
            "decisao": resultado.decisao.value,
            "probabilidade_perda": resultado.probabilidade_perda,
            "valor_condenacao_estimado": resultado.valor_condenacao_estimado,
            "valor_condenacao_faixa": list(resultado.valor_condenacao_faixa),
            "custo_esperado_defesa": resultado.custo_esperado_defesa,
            "valor_acordo_sugerido": resultado.valor_acordo_sugerido,
            "override_aplicado": resultado.override_aplicado,
            "razao_override": resultado.razao_override,
            "policy": resultado.policy,
            "explicacao": resultado.explicacao,
        },
    }
