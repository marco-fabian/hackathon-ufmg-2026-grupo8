# CLAUDE.md — Motor de Decisao Juridica (Grupo 8, Hackathon UFMG 2026)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexto do Projeto

Hackathon UFMG 2026 - Enter AI Challenge (17-18/04/2026). Grupo 8. Submissao 18/04 04:00; apresentacao 07:00.

**Problema:** Banco UFMG recebe ~5k acoes/mes de pessoas alegando nao reconhecimento de contratacao de emprestimo. Para cada processo, decidir **DEFESA** ou **ACORDO** e, se acordo, o valor proposto. Leitura completa em [README.md](README.md).

## Arquitetura — Motor de Decisao ML

O motor vive em `src/backend/modelo/`. Pipeline de **2 modelos ML + 1 motor financeiro**:

```
Processo → [Modelo A: P(L)] → [Modelo B: Vc | perda] → [Motor Financeiro]
                                                                ↓
                                                E[C_defesa] = P(L)·Vc + Cp
                                                                ↓
                                                   E[C_defesa] > Limiar?
                                                   /                    \
                                                 SIM                    NAO
                                                  ↓                      ↓
                                          ACORDO (α·E[C_defesa])     DEFESA
                                                  ↓
                                    [Overrides documentais opcionais]
```

Por que separar em dois modelos + formula:
1. **Interpretabilidade:** "probabilidade de perder x condenacao esperada" e direto; um score opaco de "acordar" nao e.
2. **Politica ajustavel sem retreinar:** α e Limiar sao parametros da formula.
3. **Classe "Acordo" rara (0.47%):** nao da para classificar diretamente; usamos `Resultado macro` (30.4% perdas).
4. **α e Limiar derivados dos dados** via backtesting sobre a base de 60k.

### Modelos
- **Normalização + IFP (Índice de Força Probatória)** — responsabilidade desta branch `backend`. Duas versões:
  - **IFP v1** (`src/ifp_v1_heuristico.py`): presença-based, roda sobre o xlsx de 60k; usado no dataset de treino e na produção histórica. Sem LLM.
  - **IFP v2** (`src/ifp_v2.py` + `src/extractors/`): extrai features dos PDFs via OpenAI Structured Outputs (`gpt-4o-mini`); demo-only porque só há PDFs nos 2 casos-exemplo. Adiciona componente de qualidade (0–40) ao score de presença (0–60).
- **Motor de decisão** — consome `data/training.csv` (19 colunas, split 80/20 estratificado) e `ifp_score`/`ifp_tier` como features principais; decide defesa/acordo e sugere valor.
- **Interface do advogado (front-end)** — consome `docs/schemas/ifp.json` + exemplos em `docs/examples/ifp_v2_*.json`; renderiza o "termômetro" e a recomendação.

| Modelo | Tipo | Target | Algoritmo |
|---|---|---|---|
| A | Classificacao | `Resultado macro == "Nao Exito"` | XGBClassifier + CalibratedClassifierCV (Platt) |
| B | Regressao | `Valor da condenacao` (log1p) nos **18k perdidos** | XGBRegressor |
| B' | Quantile regression | Vc nos quantis 10/50/90 | 3x XGBRegressor (`reg:quantileerror`) |

Metricas observadas (teste = 20% = 12000 processos, `random_state=42`):
- Modelo A: AUC-ROC 0.628, Brier 0.203, ECE 0.013, CV AUC 0.624±0.005. **Calibracao quase perfeita** (taxa prevista 30.5% ≈ real 30.4%).
- Modelo B: MAE R$ 2.422, R² 0.573, MAPE 27.0%.
- Quantis: cobertura empirica IC 80% = 74.3% (alvo 80%).
- **Features usadas:** UF, Sub-assunto, Valor da causa + derivadas (log_valor_causa, valor_causa_bin, uf_taxa_perda_hist via target encoding smoothed, uf_ticket_medio_cond). `Assunto` descartado (variancia zero).
- **Teto preditivo baixo** (AUC ~0.63) e limite das features tabulares — melhora quando features documentais do extrator entrarem em producao via overrides.

### Features documentais (overrides deterministicos)

Features documentais (tem_contrato_assinado, tem_comprovante_ted, laudo_favoravel, score_fraude, indicio_de_fraude) **nao estao na base de 60k** — nao ha como calibrar multiplicadores com dados. Solucao: overrides binarios de borda, sem calibracao numerica arbitraria.

| Condicao | Decisao forcada |
|---|---|
| contrato + TED + laudo_favoravel + score_fraude < 0.3 | DEFESA |
| score_fraude > 0.7 + sem contrato | ACORDO |
| qualquer outra | usa modelo ML |

Thresholds em `config.py` (`OVERRIDE_SCORE_FRAUDE_BAIXO=0.30`, `OVERRIDE_SCORE_FRAUDE_ALTO=0.70`).

### Catalogo de politicas (backtesting)

A analise empirica da base mostrou que a economia e **linear em % de acordos**: com α<1.0, matematicamente 100% acordo sempre vence. Nao ha otimo interior. Portanto, nao escolhemos uma politica unica — geramos um **catalogo de 5** e decidimos qual apresentar.

Resultado do backtesting (teste com 12000 processos, Cp estimado R$ 1.408,72, baseline "defender tudo" = R$ 55.685.210):

| Politica | α | Limiar | % Acordos | Economia | % vs baseline |
|---|---|---|---|---|---|
| Conservadora | 0.50 | R$ 6.000 | 15.3% | R$ 7.549.985 | 13.6% |
| Moderada | 0.50 | R$ 5.000 | 31.4% | R$ 13.203.100 | 23.7% |
| **Balanceada (default)** | 0.50 | R$ 5.000 | 31.4% | R$ 13.203.100 | 23.7% |
| Agressiva | 0.50 | R$ 4.000 | 55.5% | R$ 20.293.659 | 36.4% |
| Maxima | 0.50 | R$ 500 | 100% | R$ 28.750.105 | 51.6% |

`Balanceada` e o default (proxima da taxa real de perda de 30.4%). A API aceita qualquer uma via `MotorDecisao.carregar(policy="Moderada")`. Tabela completa em `backtesting.csv`; report formatado em `report_politicas.md`.

**Limitacao conhecida:** o grid de α [0.50, 0.95] sempre converge para α=0.50 porque menor α = menor valor pago = maior economia na simulacao. Isso **nao modela recusa do autor** (um acordo pequeno pode ser rejeitado). A base nao tem dados de aceitacao/recusa — declarar na apresentacao.

### Diferenciais

1. **Motor transparente** — decisao e formula de 3 linhas com parametros auditaveis.
2. **Probabilidades calibradas** — P(L) e probabilidade real (ECE 0.013), nao score ordinal. Reliability diagram em `reliability_diagram.png`.
3. **Catalogo de 5 politicas** derivadas do backtesting — trade-off explicito em vez de numero unico.
4. **Overrides deterministicos** — features documentais sem calibracao arbitraria.
5. **Intervalos de confianca no Vc** via quantile regression — suporta negociacao ("condenacao esperada R$ 8k, faixa R$ 5k-R$ 14k").
6. **SHAP values por decisao** — `motor.explicar_shap(uf, sub, valor)` retorna top-3 contribuicoes em P(L) e Vc.
7. **Explicacoes via LLM (OpenAI)** — `explicador.gerar_explicacao(resultado)` usa GPT se `OPENAI_API_KEY` presente, fallback deterministico silencioso.

### Estrutura de arquivos

```
src/backend/
├── requirements-backend.txt
└── modelo/
    ├── __init__.py
    ├── config.py                           # constantes tecnicas (paths, RANDOM_STATE, hiperparam, grids)
    ├── features.py                         # carregar_base, build_features (OrdinalEncoder + target encoding)
    ├── modelo_probabilidade_perda.py       # Modelo A (classificador calibrado)
    ├── modelo_estimativa_condenacao.py     # Modelo B (log) + 3 quantis
    ├── motor_decisao.py                    # MotorDecisao + backtesting + overrides + pipeline_completo
    ├── explicador.py                       # SHAP + explicacao LLM (OpenAI) / fallback
    └── modelos_treinados/
        ├── modelo_probabilidade_perda.joblib
        ├── modelo_estimativa_condenacao.joblib
        ├── modelo_quantis_condenacao.joblib
        ├── encoder_features.joblib
        ├── target_encoding_stats.joblib
        ├── parametros_otimizados.json       # Cp, politicas, policy_default
        ├── backtesting.csv                  # grid completo (α x Limiar x metricas)
        ├── report_politicas.md              # tabela formatada das 5 politicas
        ├── metricas_classificacao.json
        ├── metricas_regressao.json
        ├── metricas_quantis.json
        ├── reliability_diagram.png
        ├── regressao_real_vs_previsto.png
        └── backtesting_economia_vs_acordos.png
```

**Nao vai em `config.py`:** α, Limiar, Cp, policy default, multiplicadores documentais. Todos derivados dos dados ou inexistentes (overrides sao binarios).

## Dados

- `data/Hackaton_Enter_Base_Candidatos.xlsx` — 60k processos (UF, Sub-assunto, Valor da causa, Resultado macro/micro, Valor da condenacao). 0 nulos. Base parece sintetica (exatos 2308 processos por UF).
- `data/Caso_01/` e `data/Caso_02/` — 2 processos-exemplo com PDFs (Autos + Subsidios). Caso_01 tem os 6 subsidios; Caso_02 tem apenas 3.

## Comandos

### Setup
```bash
conda activate ENTER
pip install -r src/backend/requirements-backend.txt
```

### Treinar tudo (pipeline completo)
```bash
conda run -n ENTER python -m src.backend.modelo.motor_decisao
```
Executa: Fase 2 (features) -> Fase 3 (Modelo A) -> Fase 4 (Modelo B + quantis) -> Fase 5 (backtesting + catalogo) -> demo de 5 casos.

### Rodar apenas o backtesting (modelos ja treinados)
```bash
conda run -n ENTER python -m src.backend.modelo.motor_decisao --so-backtest
```

### Testar o motor num processo
```python
from src.backend.modelo.motor_decisao import MotorDecisao

motor = MotorDecisao.carregar(policy="Balanceada")
r = motor.decidir(uf="SP", sub_assunto="Golpe", valor_causa=15000.0)
print(r.decisao.value, r.valor_acordo_sugerido, r.explicacao)
```

### Testar com features documentais (do teammate)
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

### SHAP + explicacao LLM
```bash
conda run -n ENTER python -m src.backend.modelo.explicador
```

## Integracao com o teammate (extrator de PDFs)

O teammate entrega um dict compativel com o contrato de `aplicar_overrides_documentais`:

```python
{
    "tem_contrato_assinado": bool,
    "tem_comprovante_ted": bool,
    "laudo_favoravel": bool,
    "score_fraude": float,   # [0,1]
    "indicio_de_fraude": bool,
}
```

Basta passar como `features_documentais` em `motor.decidir(...)`. Nenhum retreino necessario.

## Convencoes

- **Python 3.14** no env conda `ENTER` (todas as libs instaladas).
- **`config.py` e constantes tecnicas** — paths, `RANDOM_STATE=42`, hiperparam, grids. Nada de negocio.
- **Sem emojis nos prints** — console Windows e cp1252. UTF-8 livre em arquivos e interfaces web.
- **Reprodutibilidade** — todos os pontos aleatorios usam `cfg.RANDOM_STATE`.
- **Artefatos nunca commitados em `data/`**. Modelos em `src/backend/modelo/modelos_treinados/` podem ou nao ser commitados (ver .gitignore).

## Entregaveis

Conforme [README.md](README.md):
- Repo publico `hackathon-ufmg-2026-grupo8` com `src/`, `SETUP.md`, `docs/presentation.*`
- Video demo ate 2 min
- Submissao em hackathon.getenter.ai ate 18/04 04:00
