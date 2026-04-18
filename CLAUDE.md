# CLAUDE.md — Motor de Decisao Juridica (Grupo 8, Hackathon UFMG 2026)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexto do Projeto

Hackathon UFMG 2026 - Enter AI Challenge (17-18/04/2026). Grupo 8. Submissao 18/04 04:00; apresentacao 07:00.

**Problema:** Banco UFMG recebe ~5k acoes/mes de pessoas alegando nao reconhecimento de contratacao de emprestimo. Para cada processo, decidir **DEFESA** ou **ACORDO** e, se acordo, o valor proposto. Leitura completa em [README.md](README.md).

## Arquitetura — Motor de Decisao ML

O motor vive em `src/backend/modelo/`. Pipeline de **3 modelos ML + 1 motor financeiro**:

```
Processo -> [Modelo A: P(L)] ---.
         -> [Modelo B: Vc|perda]-+-> E[C_defesa] = P(L)*Vc + Cp
                                 |              |
                                 |              v
                                 |     E[C_defesa] > Limiar?
                                 |      /                \
                                 |    SIM                NAO
                                 |     |                  |
                                 |     v                  v
         -> [Modelo alpha ] ---> V_acordo = alpha*E[C_defesa]  DEFESA
                                       |
                                       v
                          [Overrides documentais (IFP/fraude)]
```

Por que essa arquitetura:
1. **Interpretabilidade:** "prob. de perder x condenacao esperada" e direto; score opaco de "acordar" nao e.
2. **Politica ajustavel sem retreinar A/B:** escolhemos o quantil do modelo_alpha conforme a politica.
3. **Classe "Acordo" rara (0.47%):** nao da para classificar direto; usamos `Resultado macro` (30.4% perdas).
4. **alpha condicional ao processo:** treinado em 280 acordos reais, nao chute nem grid.

### Modelos ML

| Modelo | Tipo | Target | Algoritmo | Treino |
|---|---|---|---|---|
| **A** | Classificacao | `Resultado macro == "Nao Exito"` | XGBClassifier + CalibratedClassifierCV (Platt, cv=5) | 48k processos |
| **B** | Regressao | `Valor da condenacao` (log1p) nos 18k perdidos | XGBRegressor | 14.6k |
| **B'** | Quantile regression | Vc nos quantis 10/50/90 | 3x XGBRegressor `reg:quantileerror` | 14.6k |
| **alpha** | Quantile regression | `V_acordo / E[C_defesa]` nos 280 acordos reais | 5x XGBRegressor `reg:quantileerror` (q 15/30/50/75/90) | 280 |

Metricas observadas (teste = 20% = 12k processos, `random_state=42`):
- **Modelo A:** AUC-ROC **0.919**, Brier 0.096, ECE 0.026, Log Loss 0.323. CV AUC 0.914 +/- 0.003. Calibracao quase perfeita (taxa prevista 30.6% ≈ real 30.4%).
- **Modelo B:** MAE R$ 2.449, R² 0.563, MAPE 27.2%. Media real R$ 10.616 ≈ media prevista R$ 10.205.
- **Modelo B' (quantis):** pinball loss q10=487, q50=1196, q90=421. Cobertura empirica IC 80% = **73.4%** (alvo 80%).
- **Modelo alpha:** treinado em 280 acordos reais. alpha empirico (distribuicao): media 0.609, mediana 0.542, p25 0.429, p75 0.767. Pinball loss in-sample 0.020-0.039.

**Features usadas (A/B/alpha):** `UF`, `Sub-assunto`, `Valor da causa` + derivadas `log_valor_causa`, `valor_causa_bin`, `uf_taxa_perda_hist` (target encoding smoothed) e `uf_ticket_medio_cond` + 6 booleanas de subsidios (`tem_contrato`, `tem_extrato`, `tem_comprovante`, `tem_dossie`, `tem_demonstrativo`, `tem_laudo`). `Assunto` descartado (variancia zero).

Doc completa do modelo em [docs/modelo.md](docs/modelo.md).

### Catalogo de politicas (3 — derivadas do modelo_alpha)

Com alpha condicional por processo, cada politica agora e um **par (quantil, limiar)**. O quantil e a pedida: alpha alto (q75) = oferta gorda = mais chance de fechar; alpha baixo (q30) = oferta apertada = mais economia se fechar.

| Politica | Quantil alpha | Taxa aceite (proxy) | Limiar | Intuicao |
|---|---|---|---|---|
| Conservadora | 0.75 | ~75% | R$ 7.000 | Aperta pouco, oferta mais alta, fecha mais |
| **Moderada (default)** | 0.50 | ~50% | R$ 4.000 | Mediana condicional historica |
| Arriscada | 0.30 | ~30% | R$ 2.000 | Aperta mais, economisa mais, mais recusas |

API expoe via `MotorDecisao.carregar(policy="Moderada")`. Parametros em `modelos_treinados/parametros_otimizados.json`.

**Taxa de aceite != probabilidade real** — a base so tem acordos fechados, nao recusados. O quantil e um proxy honesto: "alpha no q75 historico = 75% dos acordos similares foram fechados com alpha >= esse valor". Declarar na apresentacao.

### Overrides documentais (deterministicos)

Features documentais do extrator de PDFs **nao estao na base de 60k** que treinou A/B. Sao tratadas como overrides binarios de borda, sem calibracao numerica:

| Condicao | Decisao forcada | Razao |
|---|---|---|
| IFP >= 0.75 | DEFESA | `IFP_FORTE` |
| IFP <= 0.30 | ACORDO | `IFP_FRACO` |
| contrato + comprovante + laudo_favoravel + score_fraude < 0.30 | DEFESA | `DOCUMENTACAO_COMPLETA_SEM_FRAUDE` |
| score_fraude > 0.70 + sem contrato | ACORDO | `FRAUDE_CONFIRMADA_SEM_CONTRATO` |
| qualquer outra | modelo ML decide | — |

Thresholds em `config.py` (`OVERRIDE_SCORE_FRAUDE_BAIXO=0.30`, `OVERRIDE_SCORE_FRAUDE_ALTO=0.70`, `OVERRIDE_IFP_ALTO=0.75`, `OVERRIDE_IFP_BAIXO=0.30`).

### Diferenciais

1. **Motor transparente** — decisao = formula de 3 linhas, parametros auditaveis.
2. **Probabilidades calibradas** — P(L) e probabilidade real (ECE 0.026), nao score ordinal. Reliability diagram em `reliability_diagram.png`.
3. **alpha condicional** aprendido em 280 acordos reais — cada processo tem seu alpha conforme UF/valor/subsidios, nao um numero fixo.
4. **Intervalos de confianca no Vc e no alpha** — via quantile regression. Suporta negociacao ("condenacao esperada R$ 8k, faixa R$ 5k-R$ 14k", "alpha recomendado 0.55 no q75").
5. **Overrides deterministicos** — features documentais sem calibracao arbitraria.
6. **SHAP values por decisao** — `motor.explicar_shap(uf, sub, valor)` retorna top-3 contribuicoes em P(L) e Vc.
7. **Explicacoes via LLM (OpenAI)** — `explicador.gerar_explicacao(resultado)` usa GPT se `OPENAI_API_KEY` presente, fallback deterministico.

### Estrutura de arquivos

```
src/backend/
├── requirements-backend.txt
└── modelo/
    ├── __init__.py
    ├── config.py                           # constantes tecnicas (paths, RANDOM_STATE, hiperparam)
    ├── features.py                         # carregar_base, build_features (OrdinalEncoder + target encoding)
    ├── modelo_probabilidade_perda.py       # Modelo A (classificador calibrado)
    ├── modelo_estimativa_condenacao.py     # Modelo B (log) + 3 quantis
    ├── modelo_alpha.py                     # Modelo alpha condicional (5 quantis)
    ├── motor_decisao.py                    # MotorDecisao + overrides + pipeline_completo
    ├── explicador.py                       # SHAP + explicacao LLM (OpenAI) / fallback
    ├── adaptador_ifp.py                    # IFP v2 -> features_documentais
    └── modelos_treinados/
        ├── modelo_probabilidade_perda.joblib
        ├── modelo_estimativa_condenacao.joblib
        ├── modelo_quantis_condenacao.joblib
        ├── modelo_alpha_condicional.joblib
        ├── encoder_features.joblib
        ├── target_encoding_stats.joblib
        ├── parametros_otimizados.json       # Cp, 3 politicas, policy_default
        ├── metricas_classificacao.json
        ├── metricas_regressao.json
        ├── metricas_quantis.json
        ├── metricas_alpha.json
        ├── reliability_diagram.png
        └── regressao_real_vs_previsto.png
```

**Nao vai em `config.py`:** alpha, Cp, policy default, multiplicadores documentais. Todos derivados dos dados ou inexistentes (overrides sao binarios).

## Dados

- `data/Hackaton_Enter_Base_Candidatos.xlsx` — 60k processos (UF, Sub-assunto, Valor da causa, Resultado macro/micro, Valor da condenacao, 6 subsidios). 0 nulos. Base parece sintetica (exatos 2308 processos por UF).
- `data/banco_treino.csv` — versao CSV com as 19 colunas usadas no treino (incluindo booleanas de subsidios).
- `data/Caso_01/` e `data/Caso_02/` — 2 processos-exemplo com PDFs (Autos + Subsidios). Caso_01 tem os 6 subsidios; Caso_02 tem apenas 3.

## Comandos

### Setup
```bash
conda activate ENTER
pip install -r src/backend/requirements-backend.txt
```

### Banco de dados Postgres (opcional, para queries analiticas)
Container Postgres 16 com a base de 60k processos ja populada.
```bash
docker compose up -d db                             # sobe o container (schema aplicado automaticamente)
conda run -n ENTER python scripts/seed_db.py        # popula a tabela `processos` (idempotente)
docker compose exec db psql -U enter -d enter -c "SELECT COUNT(*) FROM processos;"
```
Conexao: `DATABASE_URL=postgresql://enter:enter@localhost:5432/enter` (ver `.env.example`). Schema em `src/backend/db/schema.sql`.

### Treinar tudo (pipeline completo)
```bash
conda run -n ENTER python -m src.backend.modelo.motor_decisao
```
Executa: features -> Modelo A -> Modelo B + quantis -> Modelo alpha -> demo.

### Rodar o pipeline end-to-end em um processo (extrator + IFP + motor)
```bash
conda run -n ENTER python scripts/pipeline.py data/Caso_01
# salva JSON em scripts/output/Caso_01.json
```

### Testar o motor num processo (Python)
```python
from src.backend.modelo.motor_decisao import MotorDecisao

motor = MotorDecisao.carregar(policy="Moderada")
r = motor.decidir(uf="SP", sub_assunto="Golpe", valor_causa=15000.0)
print(r.decisao.value, r.alpha_aplicado, r.valor_acordo_sugerido)
```

### Testar com features documentais (do extrator)
```python
r = motor.decidir(
    uf="SP", sub_assunto="Golpe", valor_causa=15000.0,
    features_documentais={
        "tem_contrato": True,
        "tem_comprovante": True,
        "laudo_favoravel": True,
        "score_fraude": 0.15,
        "ifp": 0.82,
    },
)
# -> DEFESA (override: IFP_FORTE ou DOCUMENTACAO_COMPLETA_SEM_FRAUDE)
```

### SHAP + explicacao LLM
```bash
conda run -n ENTER python -m src.backend.modelo.explicador
```

## Integracao com o extrator de PDFs

O extrator + IFP entregam um dict compativel com `aplicar_overrides_documentais`:

```python
{
    "tem_contrato": bool,
    "tem_extrato": bool,
    "tem_comprovante": bool,
    "tem_dossie": bool,
    "tem_demonstrativo": bool,
    "tem_laudo": bool,
    "ifp": float,            # [0,1] - score IFP normalizado
    "score_fraude": float,   # [0,1]
    "laudo_favoravel": bool,
    "indicio_de_fraude": bool,
}
```

Passa como `features_documentais` em `motor.decidir(...)`. Nenhum retreino necessario. O pipeline integrado esta em `scripts/pipeline.py`.

## Convencoes

- **Python 3.14** no env conda `ENTER` (todas as libs instaladas).
- **`config.py` e constantes tecnicas** — paths, `RANDOM_STATE=42`, hiperparam. Nada de negocio.
- **Sem emojis nos prints** — console Windows e cp1252. UTF-8 livre em arquivos e interfaces web.
- **Reprodutibilidade** — todos os pontos aleatorios usam `cfg.RANDOM_STATE`.
- **Artefatos nunca commitados em `data/`**. Modelos em `src/backend/modelo/modelos_treinados/` podem ou nao ser commitados (ver .gitignore).
- **Pickle shim obrigatorio em entry points externos** — `sys.modules["__main__"].TargetEncodingStats = feat.TargetEncodingStats` antes de carregar artefatos joblib (ja aplicado em `scripts/pipeline.py` e no `__main__` do modelo_alpha).

## Entregaveis

Conforme [README.md](README.md):
- Repo publico `hackathon-ufmg-2026-grupo8` com `src/`, `SETUP.md`, `docs/presentation.*`
- Video demo ate 2 min
- Submissao em hackathon.getenter.ai ate 18/04 04:00
