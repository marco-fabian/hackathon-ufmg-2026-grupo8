"""Extractor da petição inicial (Autos).

Diferente dos outros extractors, este NÃO conta para o IFP — a petição é a
alegação da parte autora, não prova do banco. Mas as features extraídas aqui
(valor da causa, tipo de alegação, red flags) alimentam o motor de decisão.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from .base import extract_with_schema, load_pdf_text

SYSTEM = """Você analisa petições iniciais brasileiras em ações cíveis contra
bancos, especificamente em casos de 'não reconhecimento de contratação de
empréstimo'. Extraia as informações pedidas, identificando alegações e
sinais que serão usados como red flags no motor de decisão.

Critérios:
- tipo_alegacao: 'golpe_especifico' se a peça descreve um golpe (fraude,
  estelionato, phishing, conta clonada) com detalhes; 'nao_reconhecimento_generico'
  quando só alega desconhecer a operação sem narrar golpe.
- autor_idoso: true apenas se houver menção explícita a idoso, aposentado
  pelo INSS, ou idade ≥ 60.
- tem_boletim_ocorrencia: true se a peça menciona BO registrado pelo autor.
- menciona_conta_terceiro / banco_destino_credito: se a peça alega que o
  crédito foi depositado em conta de OUTRO banco ou de terceiro.
- afirma_nao_ter_conta_no_banco: se o autor declara jamais ter tido conta
  no banco réu.

Retorne apenas os campos pedidos."""

TipoAlegacao = Literal["golpe_especifico", "nao_reconhecimento_generico", "outro"]


class AutosFeatures(BaseModel):
    nome_autor: str | None = None
    cpf_autor: str | None = None
    uf_comarca: str | None = Field(None, description="Sigla da UF da comarca (ex: 'MA')")
    valor_causa: float | None = Field(None, description="Valor atribuído à causa, em R$")
    tipo_alegacao: TipoAlegacao = "outro"
    tem_boletim_ocorrencia: bool = False
    menciona_conta_terceiro: bool = False
    banco_destino_credito: str | None = Field(
        None,
        description="Nome do banco diferente do réu, se a peça mencionar crédito em outro banco"
    )
    afirma_nao_ter_conta_no_banco: bool = False
    menciona_liveness_ausente: bool = False
    menciona_canal_digital: bool = False
    autor_idoso: bool = False
    autor_aposentado: bool = False
    pede_dano_moral: bool = False
    pede_repeticao_indebito: bool = False


def extract(pdf_path: Path) -> AutosFeatures:
    text = load_pdf_text(pdf_path, max_pages=6)
    return extract_with_schema(SYSTEM, text, AutosFeatures)


CRITICAL_RED_FLAGS = {
    "tem_boletim_ocorrencia": "BO registrado pelo autor",
    "afirma_nao_ter_conta_no_banco": "Autor afirma não possuir conta no banco réu",
    "menciona_conta_terceiro": "Crédito alegadamente depositado em conta de terceiro",
}

NON_CRITICAL_RED_FLAGS = {
    "menciona_liveness_ausente": "Liveness (biometria facial) ausente",
    "menciona_canal_digital": "Contratação por canal digital (app/internet)",
    "autor_idoso": "Perfil de vulnerabilidade (idoso)",
    "autor_aposentado": "Perfil de vulnerabilidade (aposentado)",
}


def red_flags_identificados(autos: AutosFeatures) -> tuple[list[str], list[str]]:
    """Retorna (criticos, nao_criticos) listando as red flags ativas."""
    criticos = [
        msg for attr, msg in CRITICAL_RED_FLAGS.items()
        if getattr(autos, attr, False)
    ]
    nao_criticos = [
        msg for attr, msg in NON_CRITICAL_RED_FLAGS.items()
        if getattr(autos, attr, False)
    ]
    return criticos, nao_criticos
