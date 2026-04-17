"""Agentes de análise cross-documento.

Diferente de extractors (um PDF -> schema determinístico), agentes recebem
contexto já estruturado (ex: output do IFP + features dos Autos) e fazem
análise de mais alto nível, como calibração de score_fraude."""

from .analisador_fraude import AnaliseFraude, analisar_fraude

__all__ = ["AnaliseFraude", "analisar_fraude"]
