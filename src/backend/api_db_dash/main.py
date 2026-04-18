"""FastAPI app — API de leitura sobre o Postgres (processos + decisoes).

Rodar da raiz do repo:
    conda run -n ENTER uvicorn src.backend.api_db_dash.main:app --reload --port 8001
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.backend.api_db_dash.routers import dashboard as dashboard_router
from src.backend.api_db_dash.routers import processos as processos_router

app = FastAPI(title="API DB Dashboard — Motor de Decisao Juridica")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(processos_router.router)
app.include_router(dashboard_router.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
