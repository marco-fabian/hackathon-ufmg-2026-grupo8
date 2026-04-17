"""Extractor do Laudo Referenciado (síntese interna do banco sobre a operação)."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from .base import extract_with_schema, load_pdf_text

SYSTEM = """Você extrai informações de laudos referenciados emitidos pelo próprio
banco, que resumem uma operação de crédito e listam as evidências coletadas
no momento da contratação: canal usado, gravação de voz (telemarketing),
biometria facial, device fingerprint, geolocalização, IP, etc.

Retorne apenas os campos pedidos."""


class LaudoFeatures(BaseModel):
    numero_contrato: str | None = None
    canal_contratacao: str | None = Field(
        None,
        description="Canal: 'presencial', 'telefonico', 'digital_app', 'correspondente', 'outro'"
    )
    situacao_atual: str | None = Field(
        None,
        description="Ex: 'ATIVO', 'EM DISCUSSÃO JUDICIAL', 'LIQUIDADO'"
    )
    tem_gravacao_voz: bool = Field(
        False,
        description="O laudo menciona gravação de voz (áudio/MP3) do atendimento?"
    )
    tem_biometria_facial: bool = Field(
        False,
        description="Há menção a biometria facial ou selfie liveness?"
    )
    tem_device_fingerprint: bool = Field(
        False,
        description="Há identificação de dispositivo (device fingerprint, hash)?"
    )
    tem_geolocalizacao: bool = Field(
        False,
        description="Há coordenadas/geolocalização do momento da contratação?"
    )
    tem_ip_registrado: bool = Field(
        False,
        description="Há registro de endereço IP do dispositivo?"
    )
    tem_assinatura_manuscrita: bool = Field(
        False,
        description="O laudo menciona termo de adesão com assinatura manuscrita?"
    )
    correspondente_bancario: str | None = Field(
        None,
        description="Nome do correspondente bancário, se houver"
    )


def extract(pdf_path: Path) -> LaudoFeatures:
    text = load_pdf_text(pdf_path)
    return extract_with_schema(SYSTEM, text, LaudoFeatures)
