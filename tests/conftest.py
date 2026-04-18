"""Fixtures compartilhadas e configuracao do sys.path para os testes.

Replica o padrao de src/backend/api.py:14-22 — insere ROOT/src no path e
aplica o pickle shim (sys.modules["__main__"].TargetEncodingStats) antes
de qualquer joblib.load. Sem isso, carregar os artefatos de
modelos_treinados/ falha com AttributeError.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

from src.backend.modelo.features import TargetEncodingStats  # noqa: E402

sys.modules["__main__"].TargetEncodingStats = TargetEncodingStats  # type: ignore[attr-defined]

import pytest  # noqa: E402

from src.backend.modelo.motor_decisao import MotorDecisao  # noqa: E402


@pytest.fixture(scope="session")
def motor_moderado() -> MotorDecisao:
    return MotorDecisao.carregar(policy="Moderada")


@pytest.fixture(scope="session")
def api_client():
    from fastapi.testclient import TestClient
    from src.backend.api import app

    return TestClient(app)
