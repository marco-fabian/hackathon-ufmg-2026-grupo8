# Setup e Execucao — Motor de Decisao Juridica (Grupo 8)

## Pre-requisitos

- Anaconda/Miniconda instalado
- Env conda `ENTER` com Python 3.14 (provisionado)
- ~2 GB livres (XGBoost, SHAP, matplotlib)
- `Hackaton_Enter_Base_Candidatos.xlsx` em `data/` (60k processos; nao versionado)

## Instalacao

```bash
conda activate ENTER
pip install -r src/backend/requirements-backend.txt
```

Libs: pandas 3.0, numpy 2.4, scikit-learn 1.8, xgboost 3.2, shap 0.51, matplotlib 3.10, openai 2.32, joblib, openpyxl, python-dotenv.

## Variaveis de ambiente

```bash
cp .env.example .env
# preencha OPENAI_API_KEY (opcional — sem ela, explicacoes usam fallback deterministico)
```

## Execucao

### 1. Pipeline completo (treino + backtesting + demo, ~2 min)

```bash
conda run -n ENTER python -m src.backend.modelo.motor_decisao
```

Executa:
1. Treina Modelo A (classificacao P(L)) com XGBoost + calibracao Platt.
2. Treina Modelo B (regressao Vc em log1p) e 3 quantis (10/50/90).
3. Roda backtesting em 12k processos (120 combinacoes α x Limiar).
4. Gera catalogo de 5 politicas em `parametros_otimizados.json`.
5. Imprime demo de 5 casos.

Artefatos em `src/backend/modelo/modelos_treinados/`:
- `modelo_*.joblib`, `encoder_features.joblib`, `target_encoding_stats.joblib`
- `parametros_otimizados.json`, `backtesting.csv`, `report_politicas.md`
- `metricas_*.json`, `reliability_diagram.png`, `regressao_real_vs_previsto.png`, `backtesting_economia_vs_acordos.png`

### 2. Apenas re-rodar o backtesting

```bash
conda run -n ENTER python -m src.backend.modelo.motor_decisao --so-backtest
```

### 3. Treinar apenas um modelo isoladamente

```bash
conda run -n ENTER python -m src.backend.modelo.modelo_probabilidade_perda
conda run -n ENTER python -m src.backend.modelo.modelo_estimativa_condenacao
```

### 4. SHAP + explicacao LLM

```bash
conda run -n ENTER python -m src.backend.modelo.explicador
```

## Uso programatico

```python
from src.backend.modelo.motor_decisao import MotorDecisao

motor = MotorDecisao.carregar(policy="Balanceada")

r = motor.decidir(uf="SP", sub_assunto="Golpe", valor_causa=25000.0)
print(r.decisao.value)                  # "ACORDO" ou "DEFESA"
print(r.probabilidade_perda)            # [0, 1]
print(r.valor_condenacao_estimado)      # R$
print(r.valor_condenacao_faixa)         # (q10, q90), IC 80%
print(r.custo_esperado_defesa)          # R$
print(r.valor_acordo_sugerido)          # R$ se ACORDO, None se DEFESA
print(r.explicacao)                     # texto para o advogado
```

### Com features documentais (do extrator de PDFs do teammate)

```python
r = motor.decidir(
    uf="SP", sub_assunto="Golpe", valor_causa=15000.0,
    features_documentais={
        "tem_contrato_assinado": True,
        "tem_comprovante_ted": True,
        "laudo_favoravel": True,
        "score_fraude": 0.15,
    },
)
# -> DEFESA (override: DOCUMENTACAO_COMPLETA_SEM_FRAUDE)
```

### Trocar politica em runtime

```python
motor_agressivo = MotorDecisao.carregar(policy="Agressiva")
```

Politicas: `Conservadora`, `Moderada`, `Balanceada` (default), `Agressiva`, `Maxima`. Definidas pelo backtesting.

## Testes

Suite pytest com 23 testes, roda em ~10s. Cobre o core de decisao (funcoes puras + integracao com os `.joblib` treinados + smoke da API FastAPI).

### Instalacao das deps de teste

Ja incluidas em `src/backend/requirements-backend.txt`. Se atualizar o ambiente:

```bash
conda run -n ENTER pip install pytest pytest-cov httpx
```

### Rodar a suite

```bash
# Todos os testes
conda run -n ENTER python -m pytest tests/ -v

# Com relatorio de cobertura (terminal)
conda run -n ENTER python -m pytest tests/ --cov=src/backend --cov-report=term-missing

# Cobertura em HTML (abre htmlcov/index.html)
conda run -n ENTER python -m pytest tests/ --cov=src/backend --cov-report=html
```

### O que esta coberto

| Arquivo | Escopo | Coverage |
|---|---|---|
| [tests/test_overrides.py](tests/test_overrides.py) | Matriz de `aplicar_overrides_documentais` (IFP, fraude, doc completa, prioridade) | — |
| [tests/test_adaptador_ifp.py](tests/test_adaptador_ifp.py) | `ifp_to_features_doc` — traducao IFP v2 → contrato do motor | 100% |
| [tests/test_motor_decisao.py](tests/test_motor_decisao.py) | `MotorDecisao.decidir()` end-to-end, 4 caminhos de override, comparacao de policies | 87% |
| [tests/test_api.py](tests/test_api.py) | Smoke da FastAPI (`/health`, `/metricas`, `/decidir`) | 57% |

### O que fica de fora (intencional)

- **Pipelines de treino** (`modelo_probabilidade_perda.py`, `modelo_estimativa_condenacao.py`) — custoso e requer base `.xlsx` completa.
- **Endpoints DB** (`/api/analise*`, `/api/processos-finalizados`) — precisam de `docker compose up -d db` + seed; ficam pra fase 2.
- **Extractores de PDF** (`src/extractors/*`) — dependem de chamada LLM real.
- **`GET /api/politicas`** — endpoint le chaves de `parametros_otimizados.json` que o backtest atual nao gera (`alpha`, `economia_*`, `taxa_acordo_efetiva`). Divida documentada.

### Estrutura dos testes

```
tests/
├── conftest.py              # pickle shim + fixtures motor_moderado e api_client (scope=session)
├── test_overrides.py
├── test_adaptador_ifp.py
├── test_motor_decisao.py
└── test_api.py
```

A fixture `motor_moderado` carrega `MotorDecisao.carregar(policy="Moderada")` uma vez por sessao — os 6 testes de integracao compartilham o mesmo motor.

## Estrutura do Projeto

```
.
├── CLAUDE.md                             # documentacao tecnica completa
├── README.md                             # enunciado do desafio
├── SETUP.md                              # este arquivo
├── .env.example
├── data/                                 # NAO VERSIONADO
│   ├── Hackaton_Enter_Base_Candidatos.xlsx
│   └── Caso_01/ Caso_02/                 # processos-exemplo (PDFs)
├── docs/                                 # apresentacao, slides
└── src/
    └── backend/
        ├── requirements-backend.txt
        └── modelo/                       # motor de decisao
            ├── config.py                  # constantes tecnicas
            ├── features.py                # feature engineering
            ├── modelo_probabilidade_perda.py
            ├── modelo_estimativa_condenacao.py
            ├── motor_decisao.py           # pipeline + backtesting + overrides
            ├── explicador.py              # SHAP + LLM
            └── modelos_treinados/         # artefatos gerados pelo treino
```
