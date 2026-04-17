"""
Motor de decisão — defesa vs acordo, com sugestão de valor.

Consome:
- Output do IFP v2 (score, tier, presença de subsídios)
- AutosFeatures (petição inicial + red flags)

Produz uma recomendação auditável para o advogado, seguindo as regras do
ADR 0003.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from extractors.autos import AutosFeatures, red_flags_identificados

FATOR_CONDENACAO = 0.70
FATOR_DESCONTO_ACORDO = 0.43

Decisao = Literal["DEFENDER", "ACORDO"]
Confianca = Literal["ALTA", "MÉDIA", "BAIXA"]


class ValorSugerido(TypedDict):
    valor_causa: float
    condenacao_esperada: float
    proposta_acordo: float
    formula: str


class DecisaoRecomendada(TypedDict):
    processo_id: str
    decisao: Decisao
    confianca: Confianca
    ifp_score: int
    ifp_tier: str
    red_flags_criticos: list[str]
    red_flags_nao_criticos: list[str]
    valor_sugerido: ValorSugerido | None
    racional: str


def _proposta_acordo(valor_causa: float) -> ValorSugerido:
    cond = round(valor_causa * FATOR_CONDENACAO, 2)
    acordo = round(cond * FATOR_DESCONTO_ACORDO, 2)
    return {
        "valor_causa": round(valor_causa, 2),
        "condenacao_esperada": cond,
        "proposta_acordo": acordo,
        "formula": (
            f"valor_causa × {FATOR_CONDENACAO} × {FATOR_DESCONTO_ACORDO} "
            f"= R$ {acordo:,.2f}"
        ),
    }


def decidir(ifp_output: dict[str, Any], autos: AutosFeatures) -> DecisaoRecomendada:
    score = ifp_output["ifp"]["score"]
    tier = ifp_output["ifp"]["tier"]
    processo_id = ifp_output["processo_id"]
    subsidios = ifp_output["subsidios"]

    criticos, nao_criticos = red_flags_identificados(autos)
    red_flag_critico = bool(criticos)

    if tier == "FORTE":
        decisao: Decisao = "DEFENDER"
        if score >= 85 and not red_flag_critico:
            confianca: Confianca = "ALTA"
        else:
            confianca = "MÉDIA"
        motivo_tier = f"IFP {score} (FORTE) — documentação robusta do banco."
    elif tier == "FRACO":
        decisao = "ACORDO"
        confianca = "ALTA"
        motivo_tier = f"IFP {score} (FRACO) — documentação insuficiente."
    else:  # MÉDIO
        tem_contrato = subsidios["contrato"]["presente"]
        tem_extrato = subsidios["extrato"]["presente"]
        if tem_contrato and tem_extrato:
            decisao = "DEFENDER"
            base = "Contrato e Extrato presentes (regra 2×2)."
        else:
            decisao = "ACORDO"
            base = (
                "Falta "
                + (", ".join([d for d, p in (("Contrato", tem_contrato), ("Extrato", tem_extrato)) if not p]))
                + " (regra 2×2)."
            )
        if red_flag_critico and decisao == "DEFENDER":
            decisao = "ACORDO"
            base += " Red flag crítico identificado — rebaixa decisão."
        confianca = "MÉDIA"
        motivo_tier = f"IFP {score} (MÉDIO) — {base}"

    valor_sugerido: ValorSugerido | None = None
    if decisao == "ACORDO" and autos.valor_causa:
        valor_sugerido = _proposta_acordo(autos.valor_causa)

    partes_racional = [motivo_tier]
    if criticos:
        partes_racional.append("Red flags críticos: " + "; ".join(criticos) + ".")
    if nao_criticos:
        partes_racional.append("Sinalizações de contexto: " + "; ".join(nao_criticos) + ".")
    if valor_sugerido:
        partes_racional.append(
            f"Proposta de acordo: R$ {valor_sugerido['proposta_acordo']:,.2f} "
            f"({valor_sugerido['formula']})."
        )

    return {
        "processo_id": processo_id,
        "decisao": decisao,
        "confianca": confianca,
        "ifp_score": score,
        "ifp_tier": tier,
        "red_flags_criticos": criticos,
        "red_flags_nao_criticos": nao_criticos,
        "valor_sugerido": valor_sugerido,
        "racional": " ".join(partes_racional),
    }
