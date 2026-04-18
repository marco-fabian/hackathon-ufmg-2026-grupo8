"""Conexao com o Postgres local (container Docker)."""
from __future__ import annotations

import os

import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://enter:enter@localhost:5432/enter",
)


def conectar() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL)
