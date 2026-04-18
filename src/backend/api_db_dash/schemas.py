"""Pydantic schemas dos endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

StatusProcesso = Literal["aguardando_julgamento", "para_avaliar", "analisado"]


class Processo(BaseModel):
    numero_processo: str
    uf: str
    sub_assunto: str
    valor_causa: float

    status: StatusProcesso
    decisao_motor: Optional[str] = None  # 'DEFESA' | 'ACORDO' (politica default), None se aguardando
    ifp_tier: Optional[str] = None
    score_fraude: Optional[float] = None
    indicio_de_fraude: Optional[bool] = None
    criado_em: Optional[datetime] = None
    analisado_em: Optional[datetime] = None


class ProcessoListResponse(BaseModel):
    items: list[Processo]
    total: int
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=200)
