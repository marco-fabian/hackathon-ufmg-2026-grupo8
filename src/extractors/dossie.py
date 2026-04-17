"""Extractor do Dossiê de Verificação Grafotécnica (Veritas)."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from .base import extract_with_schema, load_pdf_text

SYSTEM = """Você extrai resultados de dossiês de perícia grafotécnica e documental
utilizados para validar a autoria de contratos bancários. Interessa saber se
a assinatura confere, se os documentos pessoais são autênticos e se houve
validação biométrica (liveness). Retorne apenas os campos pedidos."""


class DossieFeatures(BaseModel):
    assinatura_confere: bool = Field(
        False,
        description="A perícia concluiu que a assinatura manuscrita confere com padrões de referência?"
    )
    rg_confere: bool = Field(
        False,
        description="O RG/documento de identidade apresentado foi validado como autêntico?"
    )
    liveness_aprovada: bool = Field(
        False,
        description="Houve captura fotográfica (selfie/liveness) e ela foi aprovada?"
    )
    comprovante_residencia_valido: bool = Field(
        False,
        description="O comprovante de residência foi validado?"
    )
    score_confianca: float | None = Field(
        None,
        description="Se o dossiê mencionar um score/confiança numérico da análise, coloque aqui (0-100)"
    )
    conclusao_geral: str | None = Field(
        None,
        description="Ex: 'aprovado', 'reprovado', 'inconclusivo'"
    )


def extract(pdf_path: Path) -> DossieFeatures:
    text = load_pdf_text(pdf_path)
    return extract_with_schema(SYSTEM, text, DossieFeatures)
