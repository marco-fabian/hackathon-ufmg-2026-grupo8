"""Extractor do Contrato (Cédula de Crédito Bancário)."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from .base import extract_with_schema, load_pdf_text

SYSTEM = """Você extrai informações estruturadas de Cédulas de Crédito Bancário
brasileiras (contratos de empréstimo consignado). Responda apenas com os
campos pedidos, sem comentário adicional. Se um campo não aparecer no
documento, retorne null (ou false para booleanos)."""


class ContratoFeatures(BaseModel):
    numero_contrato: str | None = Field(None, description="Número do contrato/cédula")
    nome_tomador: str | None = Field(None, description="Nome completo do tomador (devedor)")
    cpf_tomador: str | None = Field(None, description="CPF do tomador, formato 000.000.000-00")
    valor_liberado: float | None = Field(None, description="Valor líquido liberado em R$")
    valor_total_pago: float | None = Field(None, description="Valor total a pagar em R$")
    parcela: float | None = Field(None, description="Valor da parcela mensal em R$")
    qtd_parcelas: int | None = None
    taxa_juros_am: float | None = Field(None, description="Taxa de juros mensal (a.m.), em % (ex: 1.87)")
    cet_aa: float | None = Field(None, description="Custo Efetivo Total anual (a.a.), em %")
    data_emissao: str | None = Field(None, description="Data de emissão no formato YYYY-MM-DD")
    canal_contratacao: str | None = Field(
        None,
        description="Canal: 'presencial', 'telefonico', 'digital_app', 'correspondente', 'outro'"
    )
    assinatura_tomador_presente: bool = Field(
        False,
        description="Há menção explícita a assinatura manuscrita do tomador no contrato?"
    )


def extract(pdf_path: Path) -> ContratoFeatures:
    text = load_pdf_text(pdf_path)
    return extract_with_schema(SYSTEM, text, ContratoFeatures)
