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
from pydantic import BaseModel

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

POLITICAS_ORDENADAS = ["Conservadora", "Moderada", "Balanceada", "Agressiva", "Maxima"]

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


@app.get("/api/casos/{slug}")
def obter_caso(slug: str) -> dict[str, Any]:
    path = DOCS_EXAMPLES / f"pipeline_{slug}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Caso '{slug}' nao encontrado")
    return json.loads(path.read_text(encoding="utf-8"))


_POLICY_FALLBACK_ORDER = ["Balanceada", "Moderada", "Conservadora", "Arriscada", "Agressiva", "Maxima"]


@app.get("/api/processos-finalizados")
def listar_processos_finalizados(
    limit: int = 20,
    offset: int = 0,
    uf: Optional[str] = None,
) -> list[dict[str, Any]]:
    from psycopg.rows import dict_row
    from src.backend.db.connection import conectar

    filtro = "WHERE uf = %s" if uf else ""
    params: list = [limit, offset]
    if uf:
        params = [uf, limit, offset]

    with conectar() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
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
            "processo_id": r["numero_processo"],
            "uf": r["uf"],
            "sub_assunto": r["sub_assunto"],
            "resultado_macro": r["resultado_macro"],
            "resultado_micro": r["resultado_micro"],
            "valor_causa": float(r["valor_causa"]),
            "valor_condenacao": float(r["valor_condenacao"]),
        }
        for r in rows
    ]
