# Export das tabelas

Arquivos gerados a partir do Postgres (container `enter_db`).

## Arquivos

| Arquivo | Tamanho | O que contém |
|---|---|---|
| `processos.sql` | 1,1 KB | DDL (CREATE TABLE + índices) — só a estrutura |
| `processos_full.sql` | 6,5 MB | DDL + 60.000 INSERTs (dump pg_dump completo) |
| `processos.csv` | 6,5 MB | 60.000 linhas em CSV (header + dados) |
| `decisoes_processo.sql` | 2,0 KB | DDL (CREATE TABLE + índices GIN/btree) |
| `decisoes_processo_full.sql` | 11 KB | DDL + 2 INSERTs (Caso_01, Caso_02) |
| `decisoes_processo.csv` | 7,9 KB | 2 linhas em CSV |

## Como o amigo restaura no Postgres dele

```bash
# 1. Criar um banco vazio
createdb enter

# 2. Rodar os dumps (schema + dados)
psql -U <user> -d enter -f processos_full.sql
psql -U <user> -d enter -f decisoes_processo_full.sql
```

Ou, se ele só quer a estrutura e vai popular depois:

```bash
psql -U <user> -d enter -f processos.sql
psql -U <user> -d enter -f decisoes_processo.sql
```

## Para só visualizar

Abra os `.csv` no Excel/LibreOffice/VS Code. O `processos.csv` tem 60k linhas (pode ficar lento; prefira o "Preview" do VS Code).
