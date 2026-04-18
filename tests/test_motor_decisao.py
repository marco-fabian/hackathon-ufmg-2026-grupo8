"""Testes de integracao do MotorDecisao com artefatos reais.

Carrega modelos de src/backend/modelo/modelos_treinados/ via a fixture
`motor_moderado` (scope=session). Testa invariantes e caminhos de override.
"""
from __future__ import annotations

import pytest

from src.backend.modelo.motor_decisao import (
    Decisao,
    MotorDecisao,
    RazaoOverride,
    ResultadoDecisao,
)


def test_decidir_sem_overrides_smoke(motor_moderado):
    r = motor_moderado.decidir(uf="SP", sub_assunto="Golpe", valor_causa=10000.0)
    assert isinstance(r, ResultadoDecisao)
    assert 0.0 <= r.probabilidade_perda <= 1.0
    assert r.valor_condenacao_estimado >= 0.0
    q10, q90 = r.valor_condenacao_faixa
    assert q10 <= q90
    assert r.alpha_aplicado > 0.0
    assert r.decisao in (Decisao.ACORDO, Decisao.DEFESA)
    assert r.override_aplicado is False
    assert r.razao_override == RazaoOverride.NENHUMA
    assert r.explicacao  # nao vazia
    assert r.policy == "Moderada"


def test_override_ifp_forte_forca_defesa(motor_moderado):
    r = motor_moderado.decidir(
        uf="SP",
        sub_assunto="Golpe",
        valor_causa=10000.0,
        features_documentais={"ifp": 0.90},
    )
    assert r.decisao == Decisao.DEFESA
    assert r.override_aplicado is True
    assert r.razao_override == RazaoOverride.IFP_FORTE
    assert r.valor_acordo_sugerido is None


def test_override_ifp_fraco_forca_acordo_com_perda_certa(motor_moderado):
    r = motor_moderado.decidir(
        uf="SP",
        sub_assunto="Golpe",
        valor_causa=10000.0,
        features_documentais={"ifp": 0.20},
    )
    assert r.decisao == Decisao.ACORDO
    assert r.override_aplicado is True
    assert r.razao_override == RazaoOverride.IFP_FRACO
    # Override ACORDO recalcula E[C_defesa] = Vc + Cp (P(L)=1)
    # motor_decisao.py:277-281
    esperado = r.valor_condenacao_estimado + r.custo_processual
    assert r.custo_esperado_defesa == pytest.approx(esperado, rel=1e-6)
    assert r.valor_acordo_sugerido is not None
    assert r.valor_acordo_sugerido > 0


def test_override_fraude_sem_contrato_forca_acordo(motor_moderado):
    r = motor_moderado.decidir(
        uf="SP",
        sub_assunto="Golpe",
        valor_causa=10000.0,
        features_documentais={
            "tem_contrato": False,
            "score_fraude": 0.85,
        },
    )
    assert r.decisao == Decisao.ACORDO
    assert r.razao_override == RazaoOverride.FRAUDE_CONFIRMADA_SEM_CONTRATO
    assert r.valor_acordo_sugerido is not None
    assert r.valor_acordo_sugerido > 0


def test_conservadora_tem_alpha_maior_que_arriscada():
    """Policy conservadora usa quantil 0.75, arriscada 0.30.
    Alpha do quantil mais alto deve ser maior."""
    conservadora = MotorDecisao.carregar(policy="Conservadora")
    arriscada = MotorDecisao.carregar(policy="Arriscada")
    caso = dict(uf="SP", sub_assunto="Golpe", valor_causa=25000.0)
    r_cons = conservadora.decidir(**caso)
    r_arr = arriscada.decidir(**caso)
    assert r_cons.alpha_aplicado > r_arr.alpha_aplicado


def test_policy_inexistente_raises_valueerror():
    with pytest.raises(ValueError, match="Policy"):
        MotorDecisao.carregar(policy="Inexistente")
