"""Extractor do Comprovante de Crédito (BACEN)."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from .base import extract_with_schema, load_pdf_text

SYSTEM = """Você extrai informações de Comprovantes de Crédito emitidos ao BACEN
(Banco Central). Documento regulatório que atesta uma operação de crédito
consignado. Retorne apenas os campos pedidos; use null quando faltar."""


class ComprovanteFeatures(BaseModel):
    numero_contrato: str | None = None
    cpf_tomador: str | None = None
    valor_operacao: float | None = Field(None, description="Valor líquido da operação em R$")
    qtd_parcelas: int | None = None
    taxa_juros_am: float | None = None
    cet_aa: float | None = None
    data_contratacao: str | None = Field(None, description="Data da contratação no formato YYYY-MM-DD")
    canal_contratacao: str | None = Field(
        None,
        description="Canal: 'presencial', 'telefonico', 'digital_app', 'correspondente', 'outro'"
    )
    forma_liberacao: str | None = Field(
        None,
        description="Ex: 'credito_conta_corrente', 'ted', 'cartao_magnetico', 'outro'"
    )
    instituicao_depositaria: str | None = None


def extract(pdf_path: Path) -> ComprovanteFeatures:
    text = load_pdf_text(pdf_path)
    return extract_with_schema(SYSTEM, text, ComprovanteFeatures)
