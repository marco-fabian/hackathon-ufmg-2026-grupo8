"""Extractor do Demonstrativo de Evolução da Dívida."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from .base import extract_with_schema, load_pdf_text

SYSTEM = """Você analisa demonstrativos de evolução de dívida de empréstimos
consignados brasileiros. A tabela mostra parcelas mês a mês com status
'PAGA' ou 'EM ABERTO'. Conte quantas parcelas estão em cada status. Se o
autor pagou várias parcelas antes de contestar judicialmente, isso
enfraquece a alegação de 'não reconhecimento'.

Retorne apenas os campos pedidos."""


class DemonstrativoFeatures(BaseModel):
    numero_contrato: str | None = None
    valor_financiado: float | None = None
    qtd_parcelas_total: int | None = Field(
        None,
        description="Número total de parcelas previstas no contrato"
    )
    qtd_parcelas_pagas: int = Field(
        0,
        description="Número de parcelas com status 'PAGA'"
    )
    qtd_parcelas_em_aberto: int = Field(
        0,
        description="Número de parcelas com status 'EM ABERTO' ou similar"
    )
    data_primeira_parcela: str | None = Field(
        None,
        description="Data da primeira parcela no formato YYYY-MM-DD"
    )
    data_primeira_inadimplencia: str | None = Field(
        None,
        description="Data da primeira parcela em aberto/inadimplente, se houver"
    )


def extract(pdf_path: Path) -> DemonstrativoFeatures:
    text = load_pdf_text(pdf_path, max_pages=3)
    return extract_with_schema(SYSTEM, text, DemonstrativoFeatures)
