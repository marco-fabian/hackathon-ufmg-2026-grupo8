"""
IFP v2 — Índice de Força Probatória com extração via LLM e camada de qualidade.

Recebe uma pasta de processo (estilo data/Caso_01/), classifica os PDFs por
tipo, roda um extractor por doc presente e compõe o score final:

    IFP v2 = presença (0-60) + qualidade (0-40)

Pesos e sinais definidos em docs/decisions/0002-ifp-v2-extraction.md.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable, TypedDict

from pydantic import BaseModel

from extractors import (
    ComprovanteFeatures, ContratoFeatures, DemonstrativoFeatures,
    DossieFeatures, ExtratoFeatures, LaudoFeatures,
    extract_comprovante, extract_contrato, extract_demonstrativo,
    extract_dossie, extract_extrato, extract_laudo,
)

PESOS_PRESENCA: dict[str, int] = {
    "contrato": 13,
    "extrato": 13,
    "comprovante": 9,
    "demonstrativo": 7,
    "dossie": 9,
    "laudo": 9,
}
assert sum(PESOS_PRESENCA.values()) == 60

TIER_FORTE_MIN = 75
TIER_MEDIO_MIN = 50

EXTRACTORS: dict[str, Callable[[Path], BaseModel]] = {
    "contrato": extract_contrato,
    "extrato": extract_extrato,
    "comprovante": extract_comprovante,
    "demonstrativo": extract_demonstrativo,
    "dossie": extract_dossie,
    "laudo": extract_laudo,
}

CLASSIFIER_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"contrato", re.I), "contrato"),
    (re.compile(r"extrato", re.I), "extrato"),
    (re.compile(r"comprovante", re.I), "comprovante"),
    (re.compile(r"demonstrativo", re.I), "demonstrativo"),
    (re.compile(r"dossi[eê]", re.I), "dossie"),
    (re.compile(r"laudo", re.I), "laudo"),
]


class SubsidioV2(TypedDict):
    presente: bool
    peso_aplicado: int
    features: dict[str, Any] | None


class IFPResultV2(TypedDict):
    processo_id: str
    ifp: dict[str, Any]
    subsidios: dict[str, SubsidioV2]
    sinais_fortes: list[str]
    sinais_ausentes: list[str]
    reasoning_curto: str


def classify(filename: str) -> str | None:
    """Mapeia nome de arquivo para tipo de subsídio, ou None se for Auto/outro."""
    for pattern, tipo in CLASSIFIER_PATTERNS:
        if pattern.search(filename):
            return tipo
    return None


def _tier(score: int) -> str:
    if score >= TIER_FORTE_MIN:
        return "FORTE"
    if score >= TIER_MEDIO_MIN:
        return "MÉDIO"
    return "FRACO"


def _qualidade_e_sinais(
    features: dict[str, BaseModel],
) -> tuple[int, list[str]]:
    score = 0
    sinais: list[str] = []

    extrato: ExtratoFeatures | None = features.get("extrato")  # type: ignore[assignment]
    if extrato and extrato.autor_movimentou_dinheiro:
        score += 15
        sinais.append("extrato_autor_movimentou_dinheiro")

    demo: DemonstrativoFeatures | None = features.get("demonstrativo")  # type: ignore[assignment]
    if demo and demo.qtd_parcelas_pagas >= 3:
        score += 10
        sinais.append(f"demonstrativo_{demo.qtd_parcelas_pagas}_parcelas_pagas")

    dossie: DossieFeatures | None = features.get("dossie")  # type: ignore[assignment]
    if dossie and dossie.assinatura_confere:
        score += 8
        sinais.append("dossie_assinatura_confere")

    laudo: LaudoFeatures | None = features.get("laudo")  # type: ignore[assignment]
    if laudo and (
        laudo.tem_biometria_facial
        or laudo.tem_device_fingerprint
        or laudo.tem_geolocalizacao
        or laudo.tem_gravacao_voz
    ):
        score += 7
        evidencias = [
            n for flag, n in [
                (laudo.tem_biometria_facial, "biometria"),
                (laudo.tem_device_fingerprint, "device_fingerprint"),
                (laudo.tem_geolocalizacao, "geolocalizacao"),
                (laudo.tem_gravacao_voz, "gravacao_voz"),
            ] if flag
        ]
        sinais.append(f"laudo_evidencia_digital({'|'.join(evidencias)})")

    return score, sinais


def compute_ifp_v2(pasta_processo: Path, processo_id: str | None = None) -> IFPResultV2:
    """Calcula o IFP v2 para uma pasta de processo.

    pasta_processo: deve conter PDFs nomeados como os casos-exemplo
    (ex: 02_Contrato_*.pdf). Arquivos que não casem com nenhum tipo
    (ex: Autos) são ignorados.
    """
    pasta = Path(pasta_processo)
    pdfs = sorted(p for p in pasta.glob("*.pdf"))

    features: dict[str, BaseModel] = {}
    breakdown: dict[str, SubsidioV2] = {doc: {"presente": False, "peso_aplicado": 0, "features": None} for doc in PESOS_PRESENCA}

    presenca_score = 0
    for pdf in pdfs:
        tipo = classify(pdf.name)
        if tipo is None or tipo not in EXTRACTORS:
            continue
        extractor = EXTRACTORS[tipo]
        feat = extractor(pdf)
        features[tipo] = feat
        peso = PESOS_PRESENCA[tipo]
        presenca_score += peso
        breakdown[tipo] = {
            "presente": True,
            "peso_aplicado": peso,
            "features": feat.model_dump(),
        }

    qualidade_score, sinais_fortes = _qualidade_e_sinais(features)
    total = presenca_score + qualidade_score

    ausentes = [d for d, s in breakdown.items() if not s["presente"]]
    if ausentes:
        reasoning = (
            f"IFP v2 = {total} ({_tier(total)}). Presença {presenca_score}/60 "
            f"(falta: {', '.join(ausentes)}), qualidade {qualidade_score}/40."
        )
    else:
        reasoning = (
            f"IFP v2 = {total} ({_tier(total)}). Todos os 6 subsídios "
            f"presentes; qualidade {qualidade_score}/40."
        )

    return {
        "processo_id": processo_id or pasta.name,
        "ifp": {
            "score": total,
            "tier": _tier(total),
            "versao": "v2",
            "componentes": {
                "presenca": presenca_score,
                "qualidade": qualidade_score,
            },
        },
        "subsidios": breakdown,
        "sinais_fortes": sinais_fortes,
        "sinais_ausentes": ausentes,
        "reasoning_curto": reasoning,
    }
