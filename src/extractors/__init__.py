"""Extractors: um módulo por tipo de subsídio, cada um com Pydantic model
+ função extract(pdf_path) que chama o LLM com Structured Outputs."""

from .contrato import ContratoFeatures, extract as extract_contrato
from .extrato import ExtratoFeatures, extract as extract_extrato
from .comprovante import ComprovanteFeatures, extract as extract_comprovante
from .dossie import DossieFeatures, extract as extract_dossie
from .demonstrativo import DemonstrativoFeatures, extract as extract_demonstrativo
from .laudo import LaudoFeatures, extract as extract_laudo

__all__ = [
    "ContratoFeatures", "extract_contrato",
    "ExtratoFeatures", "extract_extrato",
    "ComprovanteFeatures", "extract_comprovante",
    "DossieFeatures", "extract_dossie",
    "DemonstrativoFeatures", "extract_demonstrativo",
    "LaudoFeatures", "extract_laudo",
]
