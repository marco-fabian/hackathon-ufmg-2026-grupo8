"""Helpers compartilhados pelos extractors: leitura de PDF e chamada ao LLM
com Structured Outputs."""

from __future__ import annotations

import os
from pathlib import Path
from typing import TypeVar

import pdfplumber
from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

T = TypeVar("T", bound=BaseModel)

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


def load_pdf_text(pdf_path: Path, max_pages: int | None = None) -> str:
    """Extrai texto bruto de um PDF via pdfplumber.

    max_pages: se setado, lê só as primeiras N páginas (Demonstrativo tem 3
    páginas de tabela repetitiva — não precisa enviar tudo ao LLM).
    """
    with pdfplumber.open(pdf_path) as pdf:
        pages = pdf.pages if max_pages is None else pdf.pages[:max_pages]
        return "\n\n".join((p.extract_text() or "") for p in pages)


def extract_with_schema(
    system_prompt: str,
    pdf_text: str,
    response_model: type[T],
) -> T:
    """Chama o LLM com Structured Outputs e devolve o Pydantic model populado."""
    client = get_client()
    resp = client.beta.chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Documento:\n\n{pdf_text}"},
        ],
        response_format=response_model,
        temperature=0,
    )
    parsed = resp.choices[0].message.parsed
    if parsed is None:
        raise RuntimeError(f"LLM devolveu parsed=None para {response_model.__name__}")
    return parsed
