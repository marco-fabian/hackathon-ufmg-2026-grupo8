"""Extractors: um módulo por tipo de documento, cada um com Pydantic model
+ função extract(pdf_path) que chama o LLM com Structured Outputs.

Subsídios do banco (contam para o IFP):
    contrato, extrato, comprovante, dossie, demonstrativo, laudo.

Petição inicial (não conta para o IFP; produz os 3 obrigatórios do motor):
    autos.
"""

from .autos import AutosFeatures, extract as extract_autos
from .contrato import ContratoFeatures, extract as extract_contrato
from .extrato import ExtratoFeatures, extract as extract_extrato
from .comprovante import ComprovanteFeatures, extract as extract_comprovante
from .dossie import DossieFeatures, extract as extract_dossie
from .demonstrativo import DemonstrativoFeatures, extract as extract_demonstrativo
from .laudo import LaudoFeatures, extract as extract_laudo

__all__ = [
    "AutosFeatures", "extract_autos",
    "ContratoFeatures", "extract_contrato",
    "ExtratoFeatures", "extract_extrato",
    "ComprovanteFeatures", "extract_comprovante",
    "DossieFeatures", "extract_dossie",
    "DemonstrativoFeatures", "extract_demonstrativo",
    "LaudoFeatures", "extract_laudo",
]
