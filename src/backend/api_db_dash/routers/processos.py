"""GET /api/processos — lista processos com filtros e paginacao.

Une `processos` (60k brutos) com `decisoes_processo` (output do motor)
e deriva o `status`:
  - aguardando_julgamento: sem linha em decisoes_processo
  - para_avaliar:          decisoes_processo.status = 'para_avaliar'
  - analisado:             decisoes_processo.status = 'analisado'
"""
from __future__ import annotations

from typing import Optional

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query

from src.backend.api_db_dash.deps import get_conn
from src.backend.api_db_dash.schemas import (
    Processo,
    ProcessoListResponse,
    StatusProcesso,
)

router = APIRouter(prefix="/api/processos", tags=["processos"])

POLITICA_DEFAULT = "Moderada"

# CTE base que deriva o status do LEFT JOIN. Reusada na contagem e na pagina.
BASE_CTE = """
WITH base AS (
    SELECT
        p.numero_processo,
        p.uf,
        p.sub_assunto,
        p.valor_causa,
        d.status                                     AS status_decisao,
        d.politicas -> %(politica)s ->> 'decisao'    AS decisao_motor,
        d.ifp_tier,
        d.score_fraude,
        d.indicio_de_fraude,
        d.criado_em,
        d.analisado_em,
        CASE
            WHEN d.processo_id IS NULL THEN 'aguardando_julgamento'
            ELSE d.status
        END AS status
    FROM processos p
    LEFT JOIN decisoes_processo d
      ON d.processo_id = p.numero_processo
)
"""


def _build_where(
    uf: Optional[str],
    sub_assunto: Optional[str],
    status: Optional[StatusProcesso],
) -> tuple[str, dict]:
    clauses: list[str] = []
    params: dict = {}
    if uf:
        clauses.append("uf = %(uf)s")
        params["uf"] = uf.upper()
    if sub_assunto:
        clauses.append("sub_assunto ILIKE %(sub_assunto)s")
        params["sub_assunto"] = f"%{sub_assunto}%"
    if status:
        clauses.append("status = %(status)s")
        params["status"] = status
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


@router.get("", response_model=ProcessoListResponse)
def listar_processos(
    conn: psycopg.Connection = Depends(get_conn),
    uf: Optional[str] = Query(None, min_length=2, max_length=2, description="UF (ex: SP)"),
    sub_assunto: Optional[str] = Query(None, description="Filtro ILIKE em sub_assunto"),
    status: Optional[StatusProcesso] = Query(None, description="aguardando_julgamento | para_avaliar | analisado"),
    politica: str = Query(POLITICA_DEFAULT, description="Politica usada para extrair a decisao do motor"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
) -> ProcessoListResponse:
    where, params = _build_where(uf, sub_assunto, status)
    params["politica"] = politica
    params["limit"] = page_size
    params["offset"] = (page - 1) * page_size

    sql_count = f"{BASE_CTE} SELECT COUNT(*) FROM base {where};"
    sql_page = f"""
    {BASE_CTE}
    SELECT numero_processo, uf, sub_assunto, valor_causa, status,
           decisao_motor, ifp_tier, score_fraude, indicio_de_fraude,
           criado_em, analisado_em
    FROM base
    {where}
    ORDER BY criado_em DESC NULLS LAST, numero_processo
    LIMIT %(limit)s OFFSET %(offset)s;
    """

    try:
        with conn.cursor() as cur:
            cur.execute(sql_count, params)
            total = cur.fetchone()[0]

            cur.execute(sql_page, params)
            rows = cur.fetchall()
    except psycopg.Error as e:
        raise HTTPException(status_code=500, detail=f"Erro de banco: {e}") from e

    items = [
        Processo(
            numero_processo=r[0],
            uf=r[1],
            sub_assunto=r[2],
            valor_causa=float(r[3]),
            status=r[4],
            decisao_motor=r[5],
            ifp_tier=r[6],
            score_fraude=float(r[7]) if r[7] is not None else None,
            indicio_de_fraude=r[8],
            criado_em=r[9],
            analisado_em=r[10],
        )
        for r in rows
    ]

    return ProcessoListResponse(items=items, total=total, page=page, page_size=page_size)
