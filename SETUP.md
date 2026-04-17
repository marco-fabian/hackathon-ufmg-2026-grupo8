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
