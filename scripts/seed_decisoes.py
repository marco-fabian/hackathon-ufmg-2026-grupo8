"""Popula a tabela `decisoes_processo` a partir dos JSONs em scripts/output/.

Um JSON = uma linha. Usa ON CONFLICT (processo_id) DO UPDATE para que rodar o
pipeline de novo atualize a decisao existente.

Uso:
    conda run -n ENTER python scripts/seed_decisoes.py
    conda run -n ENTER python scripts/seed_decisoes.py scripts/output/Caso_01.json  # um arquivo especifico
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from src.backend.db.connection import conectar

DIR_PADRAO = Path(__file__).resolve().parent / "output"

INSERT_SQL = """
INSERT INTO decisoes_processo (
    processo_id, uf, sub_assunto, valor_causa,
    ifp_score, ifp_score_normalizado, ifp_tier, ifp_presenca, ifp_qualidade,
    ifp_sinais_fortes, ifp_sinais_ausentes, ifp_reasoning,
    tem_contrato, tem_extrato, tem_comprovante, tem_dossie,
    tem_demonstrativo, tem_laudo, laudo_favoravel,
    score_fraude, indicio_de_fraude, indicadores_fraude,
    sinais_protetivos, justificativa_fraude,
    politicas
) VALUES (
    %(processo_id)s, %(uf)s, %(sub_assunto)s, %(valor_causa)s,
    %(ifp_score)s, %(ifp_score_normalizado)s, %(ifp_tier)s, %(ifp_presenca)s, %(ifp_qualidade)s,
    %(ifp_sinais_fortes)s, %(ifp_sinais_ausentes)s, %(ifp_reasoning)s,
    %(tem_contrato)s, %(tem_extrato)s, %(tem_comprovante)s, %(tem_dossie)s,
    %(tem_demonstrativo)s, %(tem_laudo)s, %(laudo_favoravel)s,
    %(score_fraude)s, %(indicio_de_fraude)s, %(indicadores_fraude)s,
    %(sinais_protetivos)s, %(justificativa_fraude)s,
    %(politicas)s
)
ON CONFLICT (processo_id) DO UPDATE SET
    uf = EXCLUDED.uf,
    sub_assunto = EXCLUDED.sub_assunto,
    valor_causa = EXCLUDED.valor_causa,
    ifp_score = EXCLUDED.ifp_score,
    ifp_score_normalizado = EXCLUDED.ifp_score_normalizado,
    ifp_tier = EXCLUDED.ifp_tier,
    ifp_presenca = EXCLUDED.ifp_presenca,
    ifp_qualidade = EXCLUDED.ifp_qualidade,
    ifp_sinais_fortes = EXCLUDED.ifp_sinais_fortes,
    ifp_sinais_ausentes = EXCLUDED.ifp_sinais_ausentes,
    ifp_reasoning = EXCLUDED.ifp_reasoning,
    tem_contrato = EXCLUDED.tem_contrato,
    tem_extrato = EXCLUDED.tem_extrato,
    tem_comprovante = EXCLUDED.tem_comprovante,
    tem_dossie = EXCLUDED.tem_dossie,
    tem_demonstrativo = EXCLUDED.tem_demonstrativo,
    tem_laudo = EXCLUDED.tem_laudo,
    laudo_favoravel = EXCLUDED.laudo_favoravel,
    score_fraude = EXCLUDED.score_fraude,
    indicio_de_fraude = EXCLUDED.indicio_de_fraude,
    indicadores_fraude = EXCLUDED.indicadores_fraude,
    sinais_protetivos = EXCLUDED.sinais_protetivos,
    justificativa_fraude = EXCLUDED.justificativa_fraude,
    politicas = EXCLUDED.politicas,
    criado_em = now()
"""


def _linha_de_json(doc: dict) -> dict:
    h = doc["header"]
    ifp = doc["ifp"]
    fd = doc["features_documentais"]
    fr = doc["analise_fraude"]
    return {
        "processo_id": h["processo_id"],
        "uf": h["uf"],
        "sub_assunto": h["sub_assunto"],
        "valor_causa": h["valor_causa"],
        "ifp_score": ifp["score"],
        "ifp_score_normalizado": ifp["score_normalizado"],
        "ifp_tier": ifp["tier"],
        "ifp_presenca": ifp["componentes"]["presenca"],
        "ifp_qualidade": ifp["componentes"]["qualidade"],
        "ifp_sinais_fortes": json.dumps(ifp["sinais_fortes"], ensure_ascii=False),
        "ifp_sinais_ausentes": json.dumps(ifp["sinais_ausentes"], ensure_ascii=False),
        "ifp_reasoning": ifp["reasoning"],
        "tem_contrato": fd["tem_contrato"],
        "tem_extrato": fd["tem_extrato"],
        "tem_comprovante": fd["tem_comprovante"],
        "tem_dossie": fd["tem_dossie"],
        "tem_demonstrativo": fd["tem_demonstrativo"],
        "tem_laudo": fd["tem_laudo"],
        "laudo_favoravel": fd["laudo_favoravel"],
        "score_fraude": fr["score_fraude"],
        "indicio_de_fraude": fd["indicio_de_fraude"],
        "indicadores_fraude": json.dumps(fr["indicadores_fraude"], ensure_ascii=False),
        "sinais_protetivos": json.dumps(fr["sinais_protetivos"], ensure_ascii=False),
        "justificativa_fraude": fr["justificativa"],
        "politicas": json.dumps(doc["politicas"], ensure_ascii=False),
    }


def main(argv: list[str]) -> int:
    if len(argv) > 1:
        arquivos = [Path(p) for p in argv[1:]]
    else:
        arquivos = sorted(DIR_PADRAO.glob("*.json"))
        if not arquivos:
            print(f"Nenhum JSON em {DIR_PADRAO}")
            return 1

    with conectar() as conn, conn.cursor() as cur:
        for f in arquivos:
            doc = json.loads(f.read_text(encoding="utf-8"))
            cur.execute(INSERT_SQL, _linha_de_json(doc))
            print(f"{f.name} -> {doc['header']['processo_id']}")
        cur.execute("SELECT COUNT(*) FROM decisoes_processo")
        total = cur.fetchone()[0]
    print(f"Total em decisoes_processo: {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
