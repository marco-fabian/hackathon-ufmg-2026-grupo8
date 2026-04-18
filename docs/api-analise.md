# API — Tela "Análise de Processo"

Endpoints que alimentam a tela `ProcessAnalysisPage` do front. Lêem direto do
Postgres (tabelas `decisoes_processo` + `decisao_escritorio`), em paralelo às
rotas `/api/casos/*` que continuam servindo as fixtures JSON.

**Base URL** (dev): `http://localhost:8000`

Subir: `conda run -n ENTER uvicorn src.backend.api:app --reload --port 8000`.

## Tabelas usadas

- `decisoes_processo` — uma linha por processo analisado pelo pipeline. Contém
  header (uf, sub_assunto, valor_causa), bloco IFP, documentação (6 flags +
  laudo_favoravel), análise de fraude e a JSONB `politicas` com as 3 saídas do
  motor (Conservadora / Moderada / Arriscada). Ver schema em
  [`src/backend/db/schema.sql`](../src/backend/db/schema.sql).
- `decisao_escritorio` — decisão final do advogado marcada na UI
  ("Aceitar Acordo" / "Recusar Defesa"). FK para `decisoes_processo`.

## `processo_id` e URL-encoding

O `processo_id` tem formato CNJ (ex: `1764352-89.2025.8.06.1818`) e contém
pontos. **Sempre URL-encode** antes de colocar na URL do cliente:

```js
const id = encodeURIComponent("1764352-89.2025.8.06.1818")
// -> "1764352-89.2025.8.06.1818" (sem escapes, aqui seguro, mas exige `:path`)
```

O FastAPI declara o parâmetro como `{processo_id:path}`, portanto aceita
qualquer caractere (inclusive `/` se aparecer).

## Endpoints

### `GET /api/analise`

Lista os processos analisados, ordenados por data de criação (desc).

**Response 200** — `application/json`:

```json
[
  {
    "processo_id": "1764352-89.2025.8.06.1818",
    "uf": "CE",
    "sub_assunto": "Golpe",
    "valor_causa": 15000.00,
    "ifp_tier": "FORTE",
    "indicio_de_fraude": false,
    "decisao_moderada": "ACORDO",
    "valor_acordo_moderada": 12500.00,
    "probabilidade_perda": 0.78,
    "criado_em": "2026-04-17T22:14:00+00:00",
    "decisao_escritorio": null
  }
]
```

Campos derivados da política **Moderada** (default):
`decisao_moderada`, `valor_acordo_moderada`, `probabilidade_perda`.

`decisao_escritorio` é `null` enquanto o advogado não decidiu; quando decidiu
vira `{ "decisao": "ACORDO" | "DEFESA", "valor_fechado": number | null, "decidido_em": "..." }`.

**curl**

```bash
curl http://localhost:8000/api/analise
```

### `GET /api/analise/{processo_id}`

Detalhe completo do processo para a tela.

**Response 200** — shape resumido:

```json
{
  "header": {
    "processo_id": "1764352-89.2025.8.06.1818",
    "uf": "CE",
    "sub_assunto": "Golpe",
    "valor_causa": 15000.00,
    "criado_em": "2026-04-17T22:14:00+00:00"
  },
  "ifp": {
    "score": 82,
    "score_normalizado": 0.820,
    "tier": "FORTE",
    "presenca": 50,
    "qualidade": 32,
    "sinais_fortes": ["extrato_autor_movimentou_dinheiro", "..."],
    "sinais_ausentes": [],
    "reasoning": "IFP v2 = 82 (FORTE). ..."
  },
  "documentacao": {
    "tem_contrato": true,
    "tem_extrato": true,
    "tem_comprovante": true,
    "tem_dossie": false,
    "tem_demonstrativo": true,
    "tem_laudo": true,
    "laudo_favoravel": true
  },
  "analise_fraude": {
    "score_fraude": 0.150,
    "indicio_de_fraude": false,
    "indicadores_fraude": [],
    "sinais_protetivos": ["extrato_autor_movimentou_dinheiro", "..."],
    "justificativa": "..."
  },
  "politicas": {
    "Conservadora": {
      "policy": "Conservadora",
      "alpha": 0.767,
      "alpha_quantil": 0.75,
      "taxa_aceite_estimada": 0.75,
      "decisao": "ACORDO",
      "valor_acordo_sugerido": 16000.00,
      "probabilidade_perda": 0.7821,
      "valor_condenacao_estimado": 12800.00,
      "valor_condenacao_faixa_ic80": { "q10": 7000.00, "q90": 18500.00 },
      "custo_esperado_defesa": 21000.00,
      "economia_esperada_vs_defesa": 3750.00,
      "override_aplicado": false,
      "razao_override": null,
      "explicacao": "Decisao: ACORDO. ..."
    },
    "Moderada":    { "...": "mesmo shape" },
    "Arriscada":   { "...": "mesmo shape" }
  },
  "sugestoes_valor": [
    { "politica": "Moderada",     "valor": 12500.00, "taxa_aceite_estimada": 0.50, "recomendado": true },
    { "politica": "Arriscada",    "valor":  9000.00, "taxa_aceite_estimada": 0.30, "recomendado": false },
    { "politica": "Conservadora", "valor": 16000.00, "taxa_aceite_estimada": 0.75, "recomendado": false }
  ],
  "decisao_escritorio": null
}
```

- `politicas` é repassado cru — o bloco JSONB salvo pelo pipeline (ver
  `scripts/pipeline.py` → `_bloco_politica()`).
- `sugestoes_valor` é derivado no backend a partir das 3 políticas; alimenta
  o modal "Ver todos os valores sugeridos". Política recomendada é
  **Moderada** (primeira da lista).
- Se o pipeline decidiu **DEFESA** em alguma política, `valor_acordo_sugerido`
  vem `null` — essa política fica **fora** de `sugestoes_valor`.

**Response 404** — processo não existe:

```json
{ "detail": "Processo '1764352-89.2025.8.06.1818' nao encontrado" }
```

**curl**

```bash
curl http://localhost:8000/api/analise/1764352-89.2025.8.06.1818
```

### `POST /api/analise/{processo_id}/decisao-escritorio`

Persiste a escolha final do advogado ("Decisão Final do Escritório").
Idempotente — chamar de novo sobrescreve.

**Request body**

```json
{ "decisao": "ACORDO", "valor_fechado": 12500.00 }
```

Regras:

- `decisao` ∈ `{ "ACORDO", "DEFESA" }`.
- `valor_fechado` é **obrigatório e positivo** quando `decisao == "ACORDO"`.
- `valor_fechado` é **ignorado** (e fica NULL no banco) quando `decisao == "DEFESA"`.

**Response 200**

```json
{
  "decisao": "ACORDO",
  "valor_fechado": 12500.00,
  "decidido_em": "2026-04-18T03:12:45+00:00"
}
```

**Response 400** — ACORDO sem `valor_fechado`:

```json
{ "detail": "valor_fechado obrigatorio e > 0 quando decisao=ACORDO" }
```

**Response 404** — `processo_id` não existe em `decisoes_processo`.

**curl**

```bash
# Aceitar acordo
curl -X POST http://localhost:8000/api/analise/1764352-89.2025.8.06.1818/decisao-escritorio \
     -H 'Content-Type: application/json' \
     -d '{"decisao":"ACORDO","valor_fechado":12500}'

# Recusar -> defesa
curl -X POST http://localhost:8000/api/analise/1764352-89.2025.8.06.1818/decisao-escritorio \
     -H 'Content-Type: application/json' \
     -d '{"decisao":"DEFESA"}'
```

## Pré-requisitos

1. Container do Postgres rodando: `docker compose up -d db`.
2. Schema aplicado (inclui `decisao_escritorio` nova). Se o container já existia
   sem essa tabela, aplique o schema manualmente:
   ```bash
   docker compose exec -T db psql -U enter -d enter < src/backend/db/schema.sql
   ```
3. `decisoes_processo` populada — rode `scripts/pipeline.py` para cada processo
   e persista o output (o script de insert na DB está fora do escopo desta API;
   pode ser feito manualmente ou via job separado).

## Notas de implementação

- Endpoints ficam em [`src/backend/api.py`](../src/backend/api.py).
- Conexão reusa `conectar()` de
  [`src/backend/db/connection.py`](../src/backend/db/connection.py). Cada
  request abre/fecha conexão — OK para o volume de demo.
- Rotas antigas `/api/casos` e `/api/casos/{slug}` (fixtures JSON) **não foram
  alteradas** e continuam funcionando em paralelo.
