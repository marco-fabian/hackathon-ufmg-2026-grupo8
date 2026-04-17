"""Extractor da petição inicial (01_Autos_*.pdf).

Produz os 3 campos obrigatórios do contrato do motor (docs/contrato-extrator.md):
- uf (2 letras maiúsculas)
- sub_assunto ("Golpe" ou "Genérico", com acento exato)
- valor_causa (float em R$)
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from .base import extract_with_schema, load_pdf_text

SYSTEM = """Você analisa petições iniciais brasileiras em ações cíveis contra
bancos. Extraia EXATAMENTE 3 campos.

Regras de classificação de sub_assunto:
- "Golpe" se a peça descreve golpe, fraude, estelionato, phishing, conta
  clonada, invasão, transferência/PIX não autorizado, boletim de ocorrência,
  ou alega "não reconhecimento" com narrativa de ação criminosa.
- "Genérico" se só alega desconhecimento da operação sem narrar golpe.

Use EXATAMENTE as strings "Golpe" ou "Genérico" (com acento em Genérico).

Regras de UF:
- Extrair da comarca ou do cabeçalho (ex: "COMARCA DE SÃO LUÍS/MA" -> "MA").
- Sempre 2 letras maiúsculas (sigla oficial).

Regras de valor_causa:
- Número em R$, sem formatação. "R$ 30.000,00" -> 30000.0.
- Se houver múltiplos valores, usar o atribuído à causa ("dá-se à causa").
"""

SubAssunto = Literal["Golpe", "Genérico"]


class AutosFeatures(BaseModel):
    uf: str = Field(..., description="Sigla da UF, 2 letras maiúsculas (ex: 'MA', 'SP')")
    sub_assunto: SubAssunto = Field(..., description="'Golpe' ou 'Genérico' (exato, com acento)")
    valor_causa: float = Field(..., description="Valor atribuído à causa em R$, sem formatação")


def extract(pdf_path: Path) -> AutosFeatures:
    text = load_pdf_text(pdf_path, max_pages=6)
    return extract_with_schema(SYSTEM, text, AutosFeatures)
