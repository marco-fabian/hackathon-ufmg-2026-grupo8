"""Testes da funcao pura `aplicar_overrides_documentais`.

Cobre a matriz de regras em src/backend/modelo/motor_decisao.py:83-120.
Thresholds em src/backend/modelo/config.py:87-91.
"""
from __future__ import annotations

from src.backend.modelo import config as cfg
from src.backend.modelo.motor_decisao import (
    Decisao,
    RazaoOverride,
    aplicar_overrides_documentais,
)


def test_sem_features_doc_none():
    assert aplicar_overrides_documentais(None) == (None, RazaoOverride.NENHUMA)


def test_features_doc_vazio():
    assert aplicar_overrides_documentais({}) == (None, RazaoOverride.NENHUMA)


def test_ifp_forte_forca_defesa():
    dec, razao = aplicar_overrides_documentais(
        {"ifp": cfg.OVERRIDE_IFP_ALTO + 0.05}
    )
    assert dec == Decisao.DEFESA
    assert razao == RazaoOverride.IFP_FORTE


def test_ifp_fraco_forca_acordo():
    dec, razao = aplicar_overrides_documentais(
        {"ifp": cfg.OVERRIDE_IFP_BAIXO - 0.05}
    )
    assert dec == Decisao.ACORDO
    assert razao == RazaoOverride.IFP_FRACO


def test_ifp_zona_cinza_sem_flags_retorna_none():
    dec, razao = aplicar_overrides_documentais({"ifp": 0.50})
    assert dec is None
    assert razao == RazaoOverride.NENHUMA


def test_documentacao_completa_sem_fraude_forca_defesa():
    dec, razao = aplicar_overrides_documentais(
        {
            "tem_contrato": True,
            "tem_comprovante": True,
            "tem_laudo": True,
            "laudo_favoravel": True,
            "score_fraude": cfg.OVERRIDE_SCORE_FRAUDE_BAIXO - 0.10,
        }
    )
    assert dec == Decisao.DEFESA
    assert razao == RazaoOverride.DOCUMENTACAO_COMPLETA_SEM_FRAUDE


def test_fraude_alta_sem_contrato_forca_acordo():
    dec, razao = aplicar_overrides_documentais(
        {
            "tem_contrato": False,
            "score_fraude": cfg.OVERRIDE_SCORE_FRAUDE_ALTO + 0.10,
        }
    )
    assert dec == Decisao.ACORDO
    assert razao == RazaoOverride.FRAUDE_CONFIRMADA_SEM_CONTRATO


def test_ifp_tem_prioridade_sobre_flags_individuais():
    # IFP forte deve vencer mesmo com fraude alta + sem contrato
    dec, razao = aplicar_overrides_documentais(
        {
            "ifp": cfg.OVERRIDE_IFP_ALTO + 0.05,
            "score_fraude": cfg.OVERRIDE_SCORE_FRAUDE_ALTO + 0.10,
            "tem_contrato": False,
        }
    )
    assert dec == Decisao.DEFESA
    assert razao == RazaoOverride.IFP_FORTE
