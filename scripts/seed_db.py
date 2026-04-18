"""Popula a tabela `processos` no Postgres a partir do xlsx.

Reutiliza `features.carregar_base()` para ler e mesclar as duas abas do
`data/Hackaton_Enter_Base_Candidatos.xlsx`. O insert usa uma tabela temporaria
+ INSERT ... ON CONFLICT DO NOTHING, entao rodar o script varias vezes nao
duplica nem falha.

Uso:
    conda run -n ENTER python scripts/seed_db.py
"""
from __future__ import annotations

import io
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.backend.db.connection import conectar
from src.backend.modelo.features import carregar_base

COLUNAS_SQL = [
    "numero_processo",
    "uf",
    "assunto",
    "sub_assunto",
    "valor_causa",
    "valor_condenacao",
    "resultado_macro",
    "resultado_micro",
    "tem_contrato",
    "tem_extrato",
    "tem_comprovante",
    "tem_dossie",
    "tem_demonstrativo",
    "tem_laudo",
]

RENAME_XLSX_TO_SQL = {
    "Número do processo": "numero_processo",
    "UF": "uf",
    "Assunto": "assunto",
    "Sub-assunto": "sub_assunto",
    "Valor da causa": "valor_causa",
    "Valor da condenação/indenização": "valor_condenacao",
    "Resultado macro": "resultado_macro",
    "Resultado micro": "resultado_micro",
}


def main() -> int:
    print("Lendo xlsx + merge das duas abas...")
    df = carregar_base()
    df = df.rename(columns=RENAME_XLSX_TO_SQL)[COLUNAS_SQL].copy()

    # Normaliza booleans (features.py guarda como int 0/1).
    for col in COLUNAS_SQL[8:]:
        df[col] = df[col].astype(bool)

    total_origem = len(df)
    print(f"DataFrame pronto: {total_origem} linhas, {len(df.columns)} colunas.")

    buffer = io.StringIO()
    df.to_csv(buffer, index=False, header=False, sep="\t", na_rep="\\N")
    buffer.seek(0)

    with conectar() as conn, conn.cursor() as cur:
        cur.execute(
            "CREATE TEMP TABLE processos_stage (LIKE processos INCLUDING DEFAULTS) "
            "ON COMMIT DROP"
        )
        print("Stream COPY para tabela temporaria...")
        t0 = time.perf_counter()
        cols_sql = ", ".join(COLUNAS_SQL)
        with cur.copy(
            f"COPY processos_stage ({cols_sql}) FROM STDIN "
            "WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')"
        ) as copy:
            copy.write(buffer.getvalue())
        copy_secs = time.perf_counter() - t0

        cur.execute(
            f"INSERT INTO processos ({cols_sql}) "
            f"SELECT {cols_sql} FROM processos_stage "
            "ON CONFLICT (numero_processo) DO NOTHING"
        )
        inseridas = cur.rowcount

        cur.execute("SELECT COUNT(*) FROM processos")
        total_tabela = cur.fetchone()[0]

    print(f"COPY: {copy_secs:.2f}s")
    print(f"Linhas inseridas nesta execucao: {inseridas}")
    print(f"Total atual em processos: {total_tabela}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
