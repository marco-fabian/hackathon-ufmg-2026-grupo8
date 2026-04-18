"""Dependencias FastAPI: conexao com o Postgres por request."""
from __future__ import annotations

from typing import Iterator

import psycopg

from src.backend.db.connection import conectar


def get_conn() -> Iterator[psycopg.Connection]:
    conn = conectar()
    try:
        yield conn
    finally:
        conn.close()
