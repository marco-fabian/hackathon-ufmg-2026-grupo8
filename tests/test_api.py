"""Smoke tests da API FastAPI (endpoints que nao tocam Postgres).

Endpoints DB (/api/analise*, /api/processos-finalizados, etc) ficam pra
fase 2 — requerem docker-compose up -d db + seed.

GET /api/politicas nao e testado: depende de chaves em
parametros_otimizados.json que o backtest atual nao popula
(alpha, taxa_acordo_efetiva, economia_*). Ver Next steps no plano.
"""
from __future__ import annotations


def test_health_ok(api_client):
    r = api_client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_metricas_tem_campos_esperados(api_client):
    r = api_client.get("/api/metricas")
    assert r.status_code == 200
    data = r.json()
    assert {"modelo_a", "modelo_b", "quantis"} <= set(data.keys())
    assert 0.8 <= data["modelo_a"]["auc_roc"] <= 1.0
    assert data["modelo_b"]["mae"] >= 0


def test_decidir_smoke(api_client):
    r = api_client.post(
        "/api/decidir",
        json={
            "uf": "SP",
            "sub_assunto": "Golpe",
            "valor_causa": 10000.0,
            "policy": "Moderada",
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["decisao"] in ("ACORDO", "DEFESA")
    assert 0.0 <= data["probabilidade_perda"] <= 1.0
    assert "jurisprudencias_relacionadas" in data
    assert isinstance(data["jurisprudencias_relacionadas"], list)


def test_decidir_policy_invalida_retorna_400(api_client):
    r = api_client.post(
        "/api/decidir",
        json={
            "uf": "SP",
            "sub_assunto": "Golpe",
            "valor_causa": 10000.0,
            "policy": "PoliticaQueNaoExiste",
        },
    )
    assert r.status_code == 400
