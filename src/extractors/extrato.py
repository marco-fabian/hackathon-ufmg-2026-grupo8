"""Extractor do Extrato Bancário — feature-chave: autor_movimentou_dinheiro."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from .base import extract_with_schema, load_pdf_text

SYSTEM = """Você analisa extratos bancários brasileiros no contexto de ações
judiciais onde o autor alega 'não reconhecimento' de um empréstimo. O ponto
crítico é identificar se o crédito do empréstimo apareceu na conta E se o
próprio autor movimentou (sacou, transferiu, pagou com) aquele dinheiro —
se sim, a alegação de não reconhecimento fica fragilizada.

Retorne apenas os campos pedidos."""


class ExtratoFeatures(BaseModel):
    credito_emprestimo_aparece: bool = Field(
        False,
        description="O crédito do empréstimo (entrada) aparece no extrato?"
    )
    valor_credito: float | None = Field(
        None,
        description="Valor do crédito do empréstimo, se aparecer"
    )
    autor_movimentou_dinheiro: bool = Field(
        False,
        description=(
            "Houve movimentação de saída (TED/PIX/saque/pagamento) feita pelo "
            "titular da conta após o crédito do empréstimo? Se o dinheiro ficou "
            "parado ou só houve entradas, responda false."
        ),
    )
    tipos_movimentacao: list[str] = Field(
        default_factory=list,
        description="Lista de tipos de movimentação de saída encontrados (ex: ['TED','PIX','SAQUE'])",
    )
    valor_total_movimentado: float | None = Field(
        None,
        description="Soma absoluta das movimentações de saída após o crédito"
    )
    destinatarios_suspeitos: bool = Field(
        False,
        description=(
            "Há transferências imediatas (mesmo dia ou dia seguinte) para terceiros "
            "que possam indicar golpe (ex: PIX para pessoas sem vínculo aparente)?"
        ),
    )


def extract(pdf_path: Path) -> ExtratoFeatures:
    text = load_pdf_text(pdf_path)
    return extract_with_schema(SYSTEM, text, ExtratoFeatures)
