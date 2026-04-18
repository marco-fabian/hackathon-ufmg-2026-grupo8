"""Testes da tradutora IFP -> contrato `features_documentais`.

Cobre src/backend/modelo/adaptador_ifp.py:31-116.
"""
from __future__ import annotations

import pytest

from src.backend.modelo.adaptador_ifp import ifp_to_features_doc


def test_dict_vazio_retorna_defaults_sem_erro():
    r = ifp_to_features_doc({})
    flags = (
        "tem_contrato",
        "tem_extrato",
        "tem_comprovante",
        "tem_dossie",
        "tem_demonstrativo",
        "tem_laudo",
    )
    assert all(r[f] is False for f in flags)
    # ifp.get("score", 50) / 100 -> 0.5
    assert r["ifp"] == 0.5
    assert r["laudo_favoravel"] is False
    assert r["indicio_de_fraude"] is False
    # Sem contrato/comprovante, ifp=0.5: branch final retorna 1 - 0.5 = 0.5
    assert r["score_fraude"] == pytest.approx(0.5)


def test_ifp_alto_com_contrato_e_comprovante_baixa_score_fraude():
    r = ifp_to_features_doc(
        {
            "ifp": {"score": 80},
            "subsidios": {
                "contrato": {"presente": True},
                "comprovante": {"presente": True},
            },
        }
    )
    assert r["ifp"] == pytest.approx(0.80)
    assert r["tem_contrato"] is True
    assert r["tem_comprovante"] is True
    # Branch doc-completa + IFP >= 0.70: score_fraude = 0.10
    assert r["score_fraude"] == pytest.approx(0.10)


def test_assinatura_nao_confere_marca_fraude():
    r = ifp_to_features_doc(
        {
            "ifp": {"score": 60},
            "subsidios": {
                "dossie": {
                    "presente": True,
                    "features": {"assinatura_confere": False},
                },
            },
        }
    )
    assert r["indicio_de_fraude"] is True
    assert r["score_fraude"] == pytest.approx(0.85)


def test_destinatarios_suspeitos_marca_fraude():
    r = ifp_to_features_doc(
        {
            "ifp": {"score": 60},
            "subsidios": {
                "extrato": {
                    "presente": True,
                    "features": {"destinatarios_suspeitos": True},
                },
            },
        }
    )
    assert r["indicio_de_fraude"] is True
    assert r["score_fraude"] == pytest.approx(0.85)


def test_laudo_com_biometria_eh_favoravel():
    r = ifp_to_features_doc(
        {
            "ifp": {"score": 70},
            "subsidios": {
                "laudo": {
                    "presente": True,
                    "features": {"tem_biometria_facial": True},
                },
            },
        }
    )
    assert r["tem_laudo"] is True
    assert r["laudo_favoravel"] is True
