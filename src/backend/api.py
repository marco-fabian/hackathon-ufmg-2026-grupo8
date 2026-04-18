"""
FastAPI — Motor de Decisao Juridica.

Rodar da raiz do repo:
    conda run -n ENTER uvicorn src.backend.api:app --reload --port 8000
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
for p in (str(SRC), str(ROOT)):
    if p not in sys.path:
        sys.path.insert(0, p)

# Shim antes de qualquer joblib.load — mesmo padrao de src/pipeline.py:29-30
from src.backend.modelo.features import TargetEncodingStats  # noqa: E402
sys.modules["__main__"].TargetEncodingStats = TargetEncodingStats  # type: ignore[attr-defined]

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from src.backend.db.connection import conectar  # noqa: E402
from src.backend.modelo.motor_decisao import MotorDecisao  # noqa: E402
from src.backend.modelo.rag_jurisprudencia import get_rag  # noqa: E402

app = FastAPI(title="Motor de Decisao Juridica")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DOCS_EXAMPLES = ROOT / "docs" / "examples"
MODELS_DIR = ROOT / "src" / "backend" / "modelo" / "modelos_treinados"
PARAMS_PATH = MODELS_DIR / "parametros_otimizados.json"

POLITICAS_ORDENADAS = ["Conservadora", "Moderada", "Arriscada"]

# Pré-carrega todos os 5 motores uma vez na inicialização
_motores: dict[str, MotorDecisao] = {}


def get_motor(policy: str = "Balanceada") -> MotorDecisao:
    if policy not in _motores:
        _motores[policy] = MotorDecisao.carregar(policy=policy)
    return _motores[policy]


# ─── Schemas ──────────────────────────────────────────────────────────────────

class FeaturesDoc(BaseModel):
    tem_contrato: bool = False
    tem_extrato: bool = False
    tem_comprovante: bool = False
    tem_dossie: bool = False
    tem_demonstrativo: bool = False
    tem_laudo: bool = False
    laudo_favoravel: bool = False
    ifp: Optional[float] = None
    score_fraude: float = 0.5
    indicio_de_fraude: bool = False


class DecidirReq(BaseModel):
    uf: str
    sub_assunto: str
    valor_causa: float
    policy: str = "Balanceada"
    include_shap: bool = False
    features_documentais: Optional[FeaturesDoc] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/politicas")
def listar_politicas() -> list[dict[str, Any]]:
    params = json.loads(PARAMS_PATH.read_text(encoding="utf-8"))
    baseline = params["custo_defender_tudo_backtest"]
    politicas = params["politicas"]
    default = params["policy_default"]

    result = []
    for nome in POLITICAS_ORDENADAS:
        p = politicas[nome]
        result.append({
            "nome": nome,
            "alpha": p["alpha"],
            "limiar": p["limiar"],
            "taxa_acordo_pct": round(p["taxa_acordo_efetiva"] * 100, 1),
            "economia_total": round(p["economia_total"]),
            "economia_pct": round(p["economia_pct"] * 100, 1),
            "economia_por_processo": round(p["economia_por_processo"]),
            "custo_total": round(p["custo_total"]),
            "baseline": round(baseline),
            "default": nome == default,
        })
    return result


@app.get("/api/metricas")
def get_metricas() -> dict[str, Any]:
    clf = json.loads((MODELS_DIR / "metricas_classificacao.json").read_text(encoding="utf-8"))
    reg = json.loads((MODELS_DIR / "metricas_regressao.json").read_text(encoding="utf-8"))
    qnt = json.loads((MODELS_DIR / "metricas_quantis.json").read_text(encoding="utf-8"))
    return {
        "modelo_a": {
            "auc_roc": round(clf["auc_roc"], 4),
            "brier_score": round(clf["brier_score"], 4),
            "ece": round(clf["ece"], 4),
            "cv_auc_mean": round(clf["cv_auc_mean"], 4),
            "cv_auc_std": round(clf["cv_auc_std"], 4),
            "taxa_perda_real": round(clf["taxa_perda_real_teste"], 4),
            "taxa_perda_prevista": round(clf["taxa_perda_prevista_teste"], 4),
            "n_test": clf["n_test"],
        },
        "modelo_b": {
            "mae": round(reg["mae"]),
            "r2": round(reg["r2"], 4),
            "mape": round(reg["mape"], 4),
            "media_real": round(reg["media_real_teste"]),
            "n_test": reg["n_test"],
        },
        "quantis": {
            "cobertura_ic80": round(qnt["cobertura_empirica_IC80"], 4),
            "pinball_q10": round(qnt["pinball_loss"]["q10"]),
            "pinball_q50": round(qnt["pinball_loss"]["q50"]),
            "pinball_q90": round(qnt["pinball_loss"]["q90"]),
        },
    }


@app.post("/api/decidir")
def decidir(req: DecidirReq) -> dict[str, Any]:
    if req.policy not in POLITICAS_ORDENADAS:
        raise HTTPException(status_code=400, detail=f"Politica invalida. Use: {POLITICAS_ORDENADAS}")
    fd = req.features_documentais.model_dump() if req.features_documentais else None
    motor = get_motor(req.policy)
    resultado = motor.decidir(req.uf, req.sub_assunto, req.valor_causa, fd)
    rag = get_rag()
    jurisprudencias = rag.buscar(req.sub_assunto, resultado.razao_override.value, resultado.decisao.value)
    out = resultado.to_dict()
    out["jurisprudencias_relacionadas"] = jurisprudencias
    if req.include_shap:
        from src.backend.modelo.explicador import explicar_shap
        out["shap"] = explicar_shap(motor, req.uf, req.sub_assunto, req.valor_causa)
    return out


@app.get("/api/casos")
def listar_casos() -> list[dict[str, Any]]:
    casos = []
    for f in sorted(DOCS_EXAMPLES.glob("pipeline_caso_*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        dec = d["decisao"]
        casos.append({
            "slug": f.stem.replace("pipeline_", ""),
            "processo_id": d["processo_id"],
            "uf": d["payload"]["uf"],
            "sub_assunto": d["payload"]["sub_assunto"],
            "valor_causa": d["payload"]["valor_causa"],
            "decisao": dec["decisao"],
            "probabilidade_perda": dec["probabilidade_perda"],
            "valor_acordo_sugerido": dec["valor_acordo_sugerido"],
            "valor_condenacao_faixa": dec["valor_condenacao_faixa"],
            "explicacao": dec["explicacao"],
        })
    return casos


@app.get("/api/casos/{slug}/arquivos")
def listar_arquivos_caso(slug: str) -> list[dict[str, Any]]:
    caso_dir = ROOT / "data" / slug.replace("caso_", "Caso_")
    if not caso_dir.exists():
        raise HTTPException(status_code=404, detail="Caso nao encontrado")
    return [
        {
            "nome": f.name,
            "tamanho_kb": round(f.stat().st_size / 1024, 1),
            "url": f"/api/arquivos/{slug}/{f.name}",
        }
        for f in sorted(caso_dir.glob("*.pdf"))
    ]


@app.get("/api/arquivos/{slug}/{filename}")
def baixar_arquivo(slug: str, filename: str) -> FileResponse:
    caso_dir = (ROOT / "data" / slug.replace("caso_", "Caso_")).resolve()
    path = (caso_dir / filename).resolve()
    if not str(path).startswith(str(caso_dir)):
        raise HTTPException(status_code=403)
    if not path.exists():
        raise HTTPException(status_code=404)
    return FileResponse(
        path,
        media_type="application/pdf",
        content_disposition_type="inline",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/casos/{slug}")
def obter_caso(slug: str) -> dict[str, Any]:
    path = DOCS_EXAMPLES / f"pipeline_{slug}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Caso '{slug}' nao encontrado")
    return json.loads(path.read_text(encoding="utf-8"))


# ─── Analise (lê de decisoes_processo + decisao_escritorio) ───────────────────

POLITICAS_ANALISE = ("Conservadora", "Moderada", "Arriscada")


class DecisaoEscritorioReq(BaseModel):
    decisao: str = Field(pattern="^(ACORDO|DEFESA)$")
    valor_fechado: Optional[float] = None


def _bloco_decisao_escritorio(row: Optional[tuple[Any, ...]]) -> Optional[dict[str, Any]]:
    if row is None or row[0] is None:
        return None
    decisao, valor_fechado, decidido_em = row
    return {
        "decisao": decisao,
        "valor_fechado": float(valor_fechado) if valor_fechado is not None else None,
        "decidido_em": decidido_em.isoformat() if decidido_em is not None else None,
    }


def _sugestoes_valor(politicas: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for nome in POLITICAS_ANALISE:
        bloco = politicas.get(nome)
        if not bloco:
            continue
        valor = bloco.get("valor_acordo_sugerido")
        if valor is None:
            continue
        out.append({
            "politica": nome,
            "valor": valor,
            "taxa_aceite_estimada": bloco.get("taxa_aceite_estimada"),
            "recomendado": nome == "Moderada",
        })
    out.sort(key=lambda s: (not s["recomendado"], s["politica"]))
    return out


@app.get("/api/analise")
def listar_analises() -> list[dict[str, Any]]:
    sql = """
        SELECT
            d.processo_id,
            d.uf,
            d.sub_assunto,
            d.valor_causa,
            d.ifp_tier,
            d.indicio_de_fraude,
            d.politicas -> 'Moderada' ->> 'decisao'             AS decisao_moderada,
            (d.politicas -> 'Moderada' ->> 'valor_acordo_sugerido')::numeric AS valor_acordo_moderada,
            (d.politicas -> 'Moderada' ->> 'probabilidade_perda')::numeric   AS probabilidade_perda,
            d.criado_em,
            de.decisao,
            de.valor_fechado,
            de.decidido_em
        FROM decisoes_processo d
        LEFT JOIN decisao_escritorio de ON de.processo_id = d.processo_id
        ORDER BY d.criado_em DESC
    """
    with conectar() as conn, conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    result: list[dict[str, Any]] = []
    for r in rows:
        (
            processo_id, uf, sub_assunto, valor_causa,
            ifp_tier, indicio_de_fraude,
            decisao_mod, valor_acordo_mod, prob_perda, criado_em,
            de_decisao, de_valor, de_em,
        ) = r
        result.append({
            "processo_id": processo_id,
            "uf": uf,
            "sub_assunto": sub_assunto,
            "valor_causa": float(valor_causa),
            "ifp_tier": ifp_tier,
            "indicio_de_fraude": indicio_de_fraude,
            "decisao_moderada": decisao_mod,
            "valor_acordo_moderada": float(valor_acordo_mod) if valor_acordo_mod is not None else None,
            "probabilidade_perda": float(prob_perda) if prob_perda is not None else None,
            "criado_em": criado_em.isoformat() if criado_em is not None else None,
            "decisao_escritorio": _bloco_decisao_escritorio((de_decisao, de_valor, de_em)),
        })
    return result


@app.get("/api/analise/{processo_id:path}")
def obter_analise(processo_id: str) -> dict[str, Any]:
    sql = """
        SELECT
            d.processo_id, d.uf, d.sub_assunto, d.valor_causa,
            d.ifp_score, d.ifp_score_normalizado, d.ifp_tier,
            d.ifp_presenca, d.ifp_qualidade,
            d.ifp_sinais_fortes, d.ifp_sinais_ausentes, d.ifp_reasoning,
            d.tem_contrato, d.tem_extrato, d.tem_comprovante,
            d.tem_dossie, d.tem_demonstrativo, d.tem_laudo, d.laudo_favoravel,
            d.score_fraude, d.indicio_de_fraude,
            d.indicadores_fraude, d.sinais_protetivos, d.justificativa_fraude,
            d.politicas, d.criado_em,
            de.decisao, de.valor_fechado, de.decidido_em
        FROM decisoes_processo d
        LEFT JOIN decisao_escritorio de ON de.processo_id = d.processo_id
        WHERE d.processo_id = %s
    """
    with conectar() as conn, conn.cursor() as cur:
        cur.execute(sql, (processo_id,))
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Processo '{processo_id}' nao encontrado")

    (
        pid, uf, sub_assunto, valor_causa,
        ifp_score, ifp_norm, ifp_tier, ifp_pres, ifp_qual,
        ifp_sinais_fortes, ifp_sinais_ausentes, ifp_reasoning,
        tem_contrato, tem_extrato, tem_comprovante,
        tem_dossie, tem_demonstrativo, tem_laudo, laudo_favoravel,
        score_fraude, indicio_de_fraude,
        indicadores_fraude, sinais_protetivos, justificativa_fraude,
        politicas, criado_em,
        de_decisao, de_valor, de_em,
    ) = row

    return {
        "header": {
            "processo_id": pid,
            "uf": uf,
            "sub_assunto": sub_assunto,
            "valor_causa": float(valor_causa),
            "criado_em": criado_em.isoformat() if criado_em is not None else None,
        },
        "ifp": {
            "score": ifp_score,
            "score_normalizado": float(ifp_norm),
            "tier": ifp_tier,
            "presenca": ifp_pres,
            "qualidade": ifp_qual,
            "sinais_fortes": ifp_sinais_fortes,
            "sinais_ausentes": ifp_sinais_ausentes,
            "reasoning": ifp_reasoning,
        },
        "documentacao": {
            "tem_contrato": tem_contrato,
            "tem_extrato": tem_extrato,
            "tem_comprovante": tem_comprovante,
            "tem_dossie": tem_dossie,
            "tem_demonstrativo": tem_demonstrativo,
            "tem_laudo": tem_laudo,
            "laudo_favoravel": laudo_favoravel,
        },
        "analise_fraude": {
            "score_fraude": float(score_fraude),
            "indicio_de_fraude": indicio_de_fraude,
            "indicadores_fraude": indicadores_fraude,
            "sinais_protetivos": sinais_protetivos,
            "justificativa": justificativa_fraude,
        },
        "politicas": politicas,
        "sugestoes_valor": _sugestoes_valor(politicas),
        "decisao_escritorio": _bloco_decisao_escritorio((de_decisao, de_valor, de_em)),
    }


@app.get("/api/processos-finalizados")
def listar_processos_finalizados(
    limit: int = 20,
    offset: int = 0,
    uf: Optional[str] = None,
) -> list[dict[str, Any]]:
    filtro = "WHERE uf = %s" if uf else ""
    params: list = ([uf] if uf else []) + [limit, offset]
    with conectar() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT numero_processo, uf, sub_assunto,
                   resultado_macro, resultado_micro,
                   valor_causa, valor_condenacao
            FROM processos
            {filtro}
            ORDER BY numero_processo
            LIMIT %s OFFSET %s
            """,
            params,
        )
        rows = cur.fetchall()
    return [
        {
            "processo_id": r[0],
            "uf": r[1],
            "sub_assunto": r[2],
            "resultado_macro": r[3],
            "resultado_micro": r[4],
            "valor_causa": float(r[5]),
            "valor_condenacao": float(r[6]),
        }
        for r in rows
    ]


@app.post("/api/analise/{processo_id:path}/decisao-escritorio")
def registrar_decisao_escritorio(processo_id: str, req: DecisaoEscritorioReq) -> dict[str, Any]:
    if req.decisao == "ACORDO":
        if req.valor_fechado is None or req.valor_fechado <= 0:
            raise HTTPException(
                status_code=400,
                detail="valor_fechado obrigatorio e > 0 quando decisao=ACORDO",
            )
        valor = req.valor_fechado
    else:
        valor = None

    with conectar() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM decisoes_processo WHERE processo_id = %s", (processo_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail=f"Processo '{processo_id}' nao encontrado")

        cur.execute(
            """
            INSERT INTO decisao_escritorio (processo_id, decisao, valor_fechado)
            VALUES (%s, %s, %s)
            ON CONFLICT (processo_id) DO UPDATE
               SET decisao = EXCLUDED.decisao,
                   valor_fechado = EXCLUDED.valor_fechado,
                   decidido_em = now()
            RETURNING decisao, valor_fechado, decidido_em
            """,
            (processo_id, req.decisao, valor),
        )
        row = cur.fetchone()

    return _bloco_decisao_escritorio(row) or {}
