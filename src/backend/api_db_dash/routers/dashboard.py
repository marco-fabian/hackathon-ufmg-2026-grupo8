"""GET /api/dashboard/charts — alimenta as 6 abas do dashboard analitico.

Uma unica request retorna todos os datasets, agregados direto da tabela
`processos` (60k linhas). 'Exito' = banco ganhou; 'Nao Exito' = banco perdeu.
"""
from __future__ import annotations

from typing import Any

import psycopg
from fastapi import APIRouter, Depends, HTTPException

from src.backend.api_db_dash.deps import get_conn

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

DOCS_COLUNAS = [
    "tem_contrato",
    "tem_extrato",
    "tem_comprovante",
    "tem_dossie",
    "tem_demonstrativo",
    "tem_laudo",
]

# Bins de valor da causa (limite superior exclusivo). Ultimo bin pega o resto.
VALOR_BINS = [
    ("0-5k",     0,      5000),
    ("5k-10k",   5000,   10000),
    ("10k-20k", 10000,   20000),
    ("20k-50k", 20000,   50000),
    ("50k+",    50000,   None),
]


def _q_win_rate_sub_assunto(cur) -> list[dict[str, Any]]:
    cur.execute("""
        SELECT sub_assunto,
               COUNT(*)                                                AS total,
               SUM(CASE WHEN resultado_macro = 'Êxito' THEN 1 ELSE 0 END) AS ganhos
        FROM processos
        GROUP BY sub_assunto
        ORDER BY total DESC;
    """)
    return [
        {
            "sub_assunto": r[0],
            "total": int(r[1]),
            "ganhos": int(r[2]),
            "taxa_ganho_pct": round(100.0 * r[2] / r[1], 2),
            "taxa_perda_pct": round(100.0 * (r[1] - r[2]) / r[1], 2),
        }
        for r in cur.fetchall()
    ]


def _q_docs_vs_defesa(cur) -> list[dict[str, Any]]:
    """Para cada documento: taxa de Exito quando presente vs ausente."""
    out = []
    for col in DOCS_COLUNAS:
        cur.execute(f"""
            SELECT {col},
                   COUNT(*)                                                AS n,
                   SUM(CASE WHEN resultado_macro = 'Êxito' THEN 1 ELSE 0 END) AS ganhos
            FROM processos
            GROUP BY {col};
        """)
        rows = {bool(r[0]): (int(r[1]), int(r[2])) for r in cur.fetchall()}
        n_com, g_com = rows.get(True, (0, 0))
        n_sem, g_sem = rows.get(False, (0, 0))
        out.append({
            "documento": col,
            "n_com": n_com,
            "taxa_ganho_com_pct": round(100.0 * g_com / n_com, 2) if n_com else 0.0,
            "n_sem": n_sem,
            "taxa_ganho_sem_pct": round(100.0 * g_sem / n_sem, 2) if n_sem else 0.0,
        })
    return out


def _q_valor_pedido_vs_pago(cur) -> list[dict[str, Any]]:
    """Bins de valor_causa x media de valor_condenacao (so condenados)."""
    out = []
    for label, lo, hi in VALOR_BINS:
        if hi is None:
            where = "valor_causa >= %s"
            params: tuple = (lo,)
        else:
            where = "valor_causa >= %s AND valor_causa < %s"
            params = (lo, hi)
        cur.execute(f"""
            SELECT COUNT(*)                                                              AS n,
                   AVG(valor_causa)                                                       AS media_pedido,
                   AVG(CASE WHEN resultado_macro = 'Não Êxito' THEN valor_condenacao END) AS media_pago,
                   COUNT(*) FILTER (WHERE resultado_macro = 'Não Êxito')                  AS n_perdidos
            FROM processos
            WHERE {where};
        """, params)
        n, m_ped, m_pago, n_perd = cur.fetchone()
        out.append({
            "faixa": label,
            "n_processos": int(n),
            "n_perdidos": int(n_perd),
            "media_valor_pedido": round(float(m_ped), 2) if m_ped is not None else 0.0,
            "media_valor_pago": round(float(m_pago), 2) if m_pago is not None else 0.0,
        })
    return out


def _q_uf_risco(cur, top: int = 10) -> list[dict[str, Any]]:
    """Top UFs por taxa de Nao Exito (perda do banco)."""
    cur.execute("""
        SELECT uf,
               COUNT(*)                                                      AS total,
               SUM(CASE WHEN resultado_macro = 'Não Êxito' THEN 1 ELSE 0 END) AS perdas
        FROM processos
        GROUP BY uf
        HAVING COUNT(*) > 0
        ORDER BY (SUM(CASE WHEN resultado_macro = 'Não Êxito' THEN 1 ELSE 0 END)::float
                  / COUNT(*)) DESC
        LIMIT %s;
    """, (top,))
    return [
        {
            "uf": r[0],
            "total": int(r[1]),
            "perdas": int(r[2]),
            "taxa_perda_pct": round(100.0 * r[2] / r[1], 2),
        }
        for r in cur.fetchall()
    ]


def _q_uf_volume(cur) -> list[dict[str, Any]]:
    cur.execute("""
        SELECT uf, COUNT(*) AS total
        FROM processos
        GROUP BY uf
        ORDER BY total DESC;
    """)
    return [{"uf": r[0], "total": int(r[1])} for r in cur.fetchall()]


def _q_uf_ticket_medio(cur) -> list[dict[str, Any]]:
    """Ticket medio de condenacao = media de valor_condenacao nos perdidos."""
    cur.execute("""
        SELECT uf,
               COUNT(*) FILTER (WHERE resultado_macro = 'Não Êxito')                  AS n_perdidos,
               AVG(CASE WHEN resultado_macro = 'Não Êxito' THEN valor_condenacao END) AS ticket_medio
        FROM processos
        GROUP BY uf
        ORDER BY ticket_medio DESC NULLS LAST;
    """)
    return [
        {
            "uf": r[0],
            "n_perdidos": int(r[1]),
            "ticket_medio": round(float(r[2]), 2) if r[2] is not None else 0.0,
        }
        for r in cur.fetchall()
    ]


@router.get("/charts")
def charts(conn: psycopg.Connection = Depends(get_conn)) -> dict[str, Any]:
    try:
        with conn.cursor() as cur:
            return {
                "win_rate_sub_assunto":  _q_win_rate_sub_assunto(cur),
                "docs_vs_defesa":        _q_docs_vs_defesa(cur),
                "valor_pedido_vs_pago":  _q_valor_pedido_vs_pago(cur),
                "uf_risco":              _q_uf_risco(cur),
                "uf_volume":             _q_uf_volume(cur),
                "uf_ticket_medio":       _q_uf_ticket_medio(cur),
            }
    except psycopg.Error as e:
        raise HTTPException(status_code=500, detail=f"Erro de banco: {e}") from e
