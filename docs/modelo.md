# Motor de Decisão Jurídica — Documentação do Modelo

Esta é a documentação técnica completa do motor de decisão do Grupo 8. Cobre a arquitetura, os 4 modelos ML treinados (Prob. Perda, Valor da Condenação, Quantis da Condenação, Alpha Condicional), a fórmula financeira que combina as saídas e as métricas observadas.

Implementação em [src/backend/modelo/](../src/backend/modelo/). Artefatos em [src/backend/modelo/modelos_treinados/](../src/backend/modelo/modelos_treinados/).

---

## 1. Visão Geral

### 1.1 Problema

Banco UFMG recebe ~5 mil processos/mês de pessoas alegando não reconhecimento de contratação de empréstimo. Para cada processo é preciso decidir:

1. **Defender** (contestar em juízo) ou **Acordar** (propor acordo extrajudicial)?
2. Se acordo, **qual valor** propor?

O motor responde às duas perguntas combinando três estimadores ML com uma fórmula de custo esperado.

### 1.2 Arquitetura

```
Processo                                     
   │                                          
   ├─► Modelo A ──► P(L)  = prob. de perder   
   ├─► Modelo B ──► Vc    = valor da condenação esperado (se perder)
   ├─► Modelo B' ─► IC80  = faixa [q10, q90] do Vc
   └─► Modelo α ──► α     = alpha condicional por política (q15..q90)
                       │
                       ▼
        E[C_defesa] = P(L) · Vc + Cp
                       │
           ┌───────────┴───────────┐
           │ E[C_defesa] > Limiar? │
           └───────────┬───────────┘
                  SIM  │  NÃO
                   │   │
                   ▼   ▼
         V_acordo =   DEFESA
         α · E[C_defesa]
                   │
                   ▼
         [Overrides documentais: IFP, score_fraude, contrato]
```

### 1.3 Por que esta decomposição

- **Interpretabilidade:** "probabilidade de perder × valor esperado" é direto; um classificador binário "acordar/defender" é opaco.
- **Política plugável:** α e Limiar são parâmetros da fórmula — mudam a postura do motor sem retreinar A ou B.
- **Classe "Acordo" rara (0.47%):** classificar diretamente seria desbalanceado. Treinamos no `Resultado macro` (30.4% de perdas, balanceado).
- **α condicional aprendido:** em vez de chutar um α fixo por política, aprendemos a distribuição de α historicamente aceito nos 280 acordos reais da base.

---

## 2. XGBoost — Por que e como

Todos os 4 modelos usam **XGBoost** (eXtreme Gradient Boosting). É o algoritmo SOTA para dados tabulares heterogêneos (mistura de categóricas + numéricas + booleanas), que é exatamente o nosso caso.

### 2.1 O que é Gradient Boosting

**Intuição:** construir uma previsão somando muitas árvores de decisão pequenas, onde **cada árvore nova tenta corrigir o erro das anteriores**.

```
previsão = árvore_1(x) + árvore_2(x) + ... + árvore_N(x)
```

- A árvore 1 faz uma previsão grosseira.
- A árvore 2 é treinada para prever o erro residual da árvore 1.
- A árvore 3 é treinada para prever o erro residual de (1 + 2). E assim por diante.

Essa sequência é "boosting". Árvores isoladas são fracas (overfitam ou são rasas demais); **a soma delas é forte**.

### 2.2 O que o XGBoost acrescenta

- **Otimização de gradiente de 2ª ordem** (usa a Hessiana — derivada segunda — não só o gradiente), o que acelera convergência e dá cortes mais precisos nas folhas.
- **Regularização explícita** (L1 e L2 sobre os pesos das folhas) que evita overfitting.
- **Subsample de linhas** (`subsample=0.8`) e **subsample de colunas** (`colsample_bytree=0.8`) por árvore, que aumenta diversidade e reduz variância.
- **Sparsity-aware split finding** — lida nativamente com valores faltantes e zeros sem precisar imputar.
- **Implementação em C++ paralelizada** — 60k linhas + 14 features treinam em segundos num laptop.

### 2.3 Hiperparâmetros usados

| Modelo | n_estimators | max_depth | learning_rate | subsample / colsample | objective |
|---|---|---|---|---|---|
| A (P(L)) | 300 | 6 | 0.10 | 0.8 / 0.8 | `binary:logistic` |
| B (Vc) | 400 | 6 | 0.08 | 0.8 / 0.8 | `reg:squarederror` (em log1p) |
| B' (quantis Vc) | 400 | 6 | 0.08 | 0.8 / 0.8 | `reg:quantileerror`, α=0.1/0.5/0.9 |
| α (condicional) | 200 | 3 | 0.05 | 0.8 / 0.8 | `reg:quantileerror`, α=0.15/0.30/0.50/0.75/0.90 |

O modelo α usa árvores **mais rasas (depth=3)** e **menos árvores (200)** porque treina em só 280 pontos — um modelo mais agressivo iria memorizar os dados (overfit).

`random_state=42` em todos os modelos para reprodutibilidade. Detalhes em [src/backend/modelo/config.py](../src/backend/modelo/config.py).

### 2.4 Por que não outros algoritmos

- **Random Forest:** ok, mas XGBoost domina em benchmarks tabulares (boosting > bagging quando há sinal).
- **Regressão Logística:** perde muita performance — não captura interações (UF × Sub-assunto × valor) sem engenharia manual.
- **Redes Neurais (ResNet, transformers):** overkill para 60k linhas tabulares. Dados tabulares pequenos favorecem árvores — [a literatura é clara sobre isso](https://arxiv.org/abs/2207.08815).

---

## 3. Features

As mesmas 14 features são usadas em todos os modelos, montadas por [src/backend/modelo/features.py](../src/backend/modelo/features.py).

### 3.1 Base (vindas do xlsx)

| Feature | Tipo | Encoding | Observação |
|---|---|---|---|
| `UF` | Categórica (26 valores) | OrdinalEncoder | Captura jurisprudência regional |
| `Sub-assunto` | Categórica ("Golpe" / "Genérico") | OrdinalEncoder | Muda taxa de perda e valor |
| `Valor da causa` | Numérica | — | Âncora monetária |
| `tem_contrato` | Booleana | 0/1 | Subsídio: contrato assinado |
| `tem_extrato` | Booleana | 0/1 | Subsídio: extrato bancário |
| `tem_comprovante` | Booleana | 0/1 | Subsídio: comprovante TED |
| `tem_dossie` | Booleana | 0/1 | Subsídio: dossiê fraude |
| `tem_demonstrativo` | Booleana | 0/1 | Subsídio: demonstrativo de dívida |
| `tem_laudo` | Booleana | 0/1 | Subsídio: laudo técnico |

**Descartada:** `Assunto` (variância zero, valor único).

**Encoding:** usamos `OrdinalEncoder` em vez de `OneHotEncoder` porque XGBoost faz splits binários por coluna — 26 UFs em 1 coluna é mais eficiente que 26 colunas esparsas, e árvores não perdem informação.

### 3.2 Derivadas (feature engineering)

| Feature | Fórmula | Por quê |
|---|---|---|
| `log_valor_causa` | `log1p(Valor da causa)` | Reduz skew de variável monetária |
| `valor_causa_bin` | Buckets via quantis (baixo/médio/alto) | Ajuda árvores com profundidade limitada |
| `uf_taxa_perda_hist` | Target encoding smoothed de `P(L) \| UF` no treino | Captura "UF historicamente ruim" |
| `uf_ticket_medio_cond` | Mediana de Vc por UF (só nas perdas, no treino) | Captura "condenações grandes nessa UF" |
| `qtd_docs` | Soma das 6 booleanas de subsídio | "completude documental" num único escalar |

**Target encoding com smoothing:** para UFs raras, em vez de usar a taxa de perda pura (variância alta), usamos `(n_UF · taxa_UF + α · taxa_global) / (n_UF + α)` com α=10. As estatísticas são **fitadas só no treino** e serializadas em `target_encoding_stats.joblib` — evita data leakage.

---

## 4. Modelo A — Probabilidade de Perda `P(L)`

### 4.1 Papel

Estima a probabilidade de o banco perder o processo (condenação por "Não Êxito" na coluna `Resultado macro`). Entra como fator multiplicativo no custo esperado da defesa.

### 4.2 Input e output

| Input | Output |
|---|---|
| 14 features do processo (ver §3) | `P(L) ∈ [0, 1]` — probabilidade calibrada |

### 4.3 Arquitetura

```
X ──► XGBClassifier ──► CalibratedClassifierCV (Platt, cv=5) ──► P(L)
```

- **XGBClassifier** gera um score bruto.
- **CalibratedClassifierCV com Platt scaling** ajusta uma sigmoide sobre o score para que saídas sejam probabilidades verdadeiras (não só ordens relativas).

### 4.4 Por que calibrar

XGBoost por padrão retorna `score ∈ [0,1]` mas **esses scores não são probabilidades** — são escores ordinais. Se usarmos direto numa fórmula como `E[C] = P(L) · Vc + Cp`, sub ou superestimamos o custo sistematicamente.

**Calibração de Platt** aprende uma função sigmoide `P(L) = σ(a · score + b)` em cross-validation que corrige o viés.

**Resultado:** ECE (Expected Calibration Error) = **0.026**. Reliability diagram em [reliability_diagram.png](../src/backend/modelo/modelos_treinados/reliability_diagram.png). Taxa de perda prevista 30.6% ≈ taxa real 30.4% no teste.

### 4.5 Métricas (teste = 12k, `random_state=42`)

| Métrica | Valor | Interpretação |
|---|---|---|
| **AUC-ROC** | **0.919** | Discriminação forte entre perdas e vitórias |
| Brier Score | 0.096 | Calibração + discriminação combinadas (menor = melhor) |
| Log Loss | 0.323 | Penaliza previsões erradas com alta confiança |
| ECE | 0.026 | Erro médio de calibração nos 10 bins |
| Acurácia (corte 0.5) | 0.870 | — |
| CV AUC (5-fold) | 0.914 ± 0.003 | Estabilidade |
| Taxa prevista / real | 30.6% / 30.4% | Calibração agregada |

### 4.6 Feature Importance (gain médio, calibrado)

| Feature | Importance |
|---|---|
| **tem_contrato** | **0.567** |
| **tem_extrato** | **0.251** |
| tem_comprovante | 0.031 |
| Sub-assunto | 0.028 |
| qtd_docs | 0.028 |
| tem_laudo | 0.017 |
| tem_dossie | 0.015 |
| tem_demonstrativo | 0.013 |
| uf_taxa_perda_hist | 0.010 |
| uf_ticket_medio_cond | 0.009 |
| log_valor_causa | 0.009 |
| Valor da causa | 0.008 |
| UF | 0.008 |
| valor_causa_bin | 0.006 |

**Leitura:** 82% do poder preditivo vem de `tem_contrato` + `tem_extrato`. Faz sentido — **o banco vence a grande maioria dos processos quando consegue provar a contratação com contrato e extrato**. UF/valor entram na margem.

Artefato: [modelo_probabilidade_perda.joblib](../src/backend/modelo/modelos_treinados/modelo_probabilidade_perda.joblib). Métricas: [metricas_classificacao.json](../src/backend/modelo/modelos_treinados/metricas_classificacao.json).

---

## 5. Modelo B — Valor da Condenação `Vc`

### 5.1 Papel

Estima quanto o banco é condenado a pagar **dado que perde o processo**. Entra como fator monetário no custo esperado.

### 5.2 Input e output

| Input | Output |
|---|---|
| 14 features do processo | `Vc ∈ R+` — valor esperado da condenação em R$ |

### 5.3 Arquitetura

```
X ──► XGBRegressor(target=log1p(Vc)) ──► expm1(pred) ──► Vc
```

- Treina em **log(Vc)** para lidar com cauda longa típica de variáveis monetárias.
- Exponencia na inferência (`expm1`) para voltar ao espaço R$.
- **Filtra** o treino para apenas os 18.267 processos com `Vc > 0` (ou seja, perdas). Incluir ganhos (Vc=0) distorceria a distribuição e subestimaria condenações.

### 5.4 Métricas (teste = 3.653 perdas)

| Métrica | Valor |
|---|---|
| MAE | R$ 2.449 |
| RMSE | R$ 3.097 |
| R² | 0.563 |
| MAPE | 27.2% |
| Média real | R$ 10.616 |
| Média prevista | R$ 10.205 |

### 5.5 Feature Importance

| Feature | Importance |
|---|---|
| **valor_causa_bin** | **0.624** |
| **Valor da causa** | **0.127** |
| log_valor_causa | 0.058 |
| uf_ticket_medio_cond | 0.031 |
| Sub-assunto | 0.025 |
| uf_taxa_perda_hist | 0.025 |
| UF | 0.015 |
| tem_extrato | 0.014 |
| qtd_docs | 0.014 |
| tem_comprovante | 0.014 |
| tem_demonstrativo | 0.014 |
| tem_contrato | 0.014 |
| tem_laudo | 0.013 |
| tem_dossie | 0.013 |

**Leitura:** 81% vem de features de valor da causa (`valor_causa_bin` + `Valor da causa` + `log_valor_causa`). Óbvio — o valor da condenação escala com o valor pedido. UF e sub-assunto têm influência marginal.

Artefato: [modelo_estimativa_condenacao.joblib](../src/backend/modelo/modelos_treinados/modelo_estimativa_condenacao.joblib). Métricas: [metricas_regressao.json](../src/backend/modelo/modelos_treinados/metricas_regressao.json). Gráfico real vs previsto: [regressao_real_vs_previsto.png](../src/backend/modelo/modelos_treinados/regressao_real_vs_previsto.png).

---

## 6. Modelo B' — Quantis da Condenação (IC80)

### 6.1 Papel

Retorna um **intervalo de confiança de 80%** para o Vc: `[q10, q90]`. Entra na explicação ao advogado — "condenação esperada R$ 10k, faixa R$ 6k–R$ 16k" — para apoiar negociação.

### 6.2 Arquitetura

Três `XGBRegressor` separados com `objective=reg:quantileerror`, um para cada quantil (0.10, 0.50, 0.90). Treinam sobre o **mesmo target** do Modelo B mas com função de perda pinball — penaliza assimetricamente previsões acima/abaixo do quantil-alvo.

### 6.3 Métricas

| Quantil | Pinball Loss |
|---|---|
| q10 | 487 |
| q50 | 1.196 |
| q90 | 421 |

**Cobertura empírica IC80:** 73.4% (alvo 80%) — ligeiro under-coverage aceitável dada a dificuldade da tarefa. Documentar na apresentação.

Artefato: [modelo_quantis_condenacao.joblib](../src/backend/modelo/modelos_treinados/modelo_quantis_condenacao.joblib).

---

## 7. Modelo α — Alpha Condicional

### 7.1 Papel

Dado um processo, prevê o **α histórico** que seria aceito em um acordo semelhante. α multiplica o custo esperado para virar valor de acordo:

```
V_acordo = α · E[C_defesa]
```

Em vez de usar um α fixo por política (como "α=0.75 sempre"), aprendemos a **distribuição condicional** de α nos 280 acordos reais da base.

### 7.2 Por que "distribuição condicional"

Cada política corresponde a um ponto diferente da distribuição:

- **Política Conservadora** (quer fechar muitos acordos) pega `α` no quantil **0.75** — alpha alto, oferta gorda, ~75% dos acordos similares foram fechados com α ≥ esse valor.
- **Política Moderada** pega a **mediana** (q=0.50) — alpha "típico" do histórico.
- **Política Arriscada** pega o quantil **0.30** — alpha baixo, oferta apertada, só ~30% dos acordos similares aceitos.

Treinamos **cinco** quantis (0.15, 0.30, 0.50, 0.75, 0.90) e expomos os cinco no output para transparência ("veja a distribuição esperada de α para esse processo").

### 7.3 Como α empírico é construído

Para cada um dos 280 acordos reais da base (`Resultado micro == "Acordo"`):

1. Rodamos **Modelo A** e **Modelo B** no processo para obter `P(L)` e `Vc`.
2. Calculamos `E[C_defesa] = P(L) · Vc + Cp` com o `Cp=R$ 1.408,72` da base.
3. Lemos o `V_acordo` real (coluna `Valor da condenação/indenização`).
4. `α_empirico = V_acordo_real / E[C_defesa_predito]`.
5. **Clipping** `[0.10, 1.00]` para remover outliers patológicos.

Isso nos dá 280 pares `(X_processo, α_empirico)` para treinar quantile regression.

### 7.4 Distribuição empírica de α (após clip)

| Estatística | Valor |
|---|---|
| Média | 0.609 |
| Desvio padrão | 0.235 |
| Mínimo | 0.234 |
| p25 | 0.429 |
| **Mediana** | **0.542** |
| p75 | 0.767 |
| Máximo | 1.000 |

### 7.5 Input e output

| Input | Output |
|---|---|
| 14 features do processo | Dict `{0.15: α, 0.30: α, 0.50: α, 0.75: α, 0.90: α}` |

**Monotonização:** após clipping, aplicamos `np.maximum.accumulate` para garantir `q_k ≤ q_{k+1}` (modelos independentes podem violar ordenação por variância de treino).

### 7.6 Métricas (pinball loss in-sample)

| Quantil | Pinball Loss |
|---|---|
| 0.15 | 0.020 |
| 0.30 | 0.026 |
| 0.50 | 0.031 |
| 0.75 | 0.023 |
| **0.90** | **0.039** |

### 7.7 Feature Importance por quantil

**q=0.30 (política Arriscada):**

| Feature | Importance |
|---|---|
| tem_contrato | 0.115 |
| tem_extrato | 0.095 |
| tem_comprovante | 0.082 |
| qtd_docs | 0.079 |
| log_valor_causa | 0.075 |

**q=0.50 (política Moderada):**

| Feature | Importance |
|---|---|
| tem_contrato | 0.207 |
| tem_extrato | 0.130 |
| qtd_docs | 0.085 |
| uf_ticket_medio_cond | 0.062 |
| tem_comprovante | 0.061 |

**q=0.75 (política Conservadora):**

| Feature | Importance |
|---|---|
| **tem_contrato** | **0.347** |
| **tem_extrato** | **0.181** |
| valor_causa_bin | 0.076 |
| qtd_docs | 0.066 |
| tem_comprovante | 0.044 |

**Leitura:** as features documentais dominam `α`, e a concentração cresce com o quantil. No q=0.75, **tem_contrato + tem_extrato = 53%** da explicação — ou seja, quando o banco tem contrato e extrato, o α historicamente aceito é mais alto (o banco "paga mais" porque está em posição forte e o autor topa fechar). Faz sentido intuitivo.

### 7.8 Limitação conhecida: q=0.90 colapsou

Pinball loss do q=0.90 é 0.039 e todas as feature importances são **zero** — o modelo aprendeu uma constante. Causa: após clip em 1.0, o percentil 90 de α ≈ 1.0 em praticamente todos os processos, então o modelo vira uma constante. Não é problema na prática porque nenhuma das 3 políticas usa q=0.90 (apenas 0.30, 0.50, 0.75), mas é documentado no JSON e deveria ser declarado se o q=0.90 for exposto no front-end.

### 7.9 Limitação fundamental: proxy vs aceitação real

A base **só tem acordos fechados** — não temos o contrafactual de "qual α foi proposto e rejeitado". Portanto:

- O **quantil NÃO é a probabilidade real de aceite** de uma proposta de α.
- É um **proxy honesto**: "α no q75 histórico = 75% dos acordos similares foram fechados com α ≥ esse valor".
- Declarado no output (`taxa_aceite_estimada`) e precisa ser explicado na apresentação.

Artefato: [modelo_alpha_condicional.joblib](../src/backend/modelo/modelos_treinados/modelo_alpha_condicional.joblib). Métricas: [metricas_alpha.json](../src/backend/modelo/modelos_treinados/metricas_alpha.json). Código: [src/backend/modelo/modelo_alpha.py](../src/backend/modelo/modelo_alpha.py).

---

## 8. Motor Financeiro — A Fórmula

### 8.1 Custo esperado da defesa

```
E[C_defesa] = P(L) · Vc + Cp
```

- `P(L)` vem do Modelo A.
- `Vc` vem do Modelo B.
- `Cp` = **custo processual fixo** = R$ 1.408,72. Estimado como mediana(Vc_perdas) × 14% (proxy de custas + honorários típicos em cível brasileiro). Salvo em `parametros_otimizados.json`.

### 8.2 Decisão

```
se E[C_defesa] > Limiar → ACORDO
senão                   → DEFESA
```

`Limiar` varia por política (ver §9).

### 8.3 Valor do acordo

```
V_acordo = α · E[C_defesa]
```

`α` vem do Modelo α, no quantil correspondente à política.

### 8.4 Economia esperada

```
economia_esperada = taxa_aceite · (E[C_defesa] − V_acordo)
```

Onde `taxa_aceite` = quantil do α (proxy). Se o autor aceita, banco economiza `E[C_defesa] − V_acordo`. Se recusa, economia é zero. Expectativa: `prob × ganho`.

---

## 9. Políticas

Três políticas, cada uma um par `(quantil_α, Limiar)`:

| Política | Quantil α | Taxa aceite (proxy) | Limiar | Postura |
|---|---|---|---|---|
| Conservadora | 0.75 | ~75% | R$ 7.000 | Oferta alta, fecha muito |
| **Moderada (default)** | **0.50** | **~50%** | **R$ 4.000** | Mediana histórica |
| Arriscada | 0.30 | ~30% | R$ 2.000 | Oferta apertada, menos fecha mais economiza |

Parâmetros em [parametros_otimizados.json](../src/backend/modelo/modelos_treinados/parametros_otimizados.json). Escolha via `MotorDecisao.carregar(policy="Moderada")`.

**Por que a Moderada é default:** o quantil 0.50 (mediana condicional) é a escolha "neutra" — banco propõe um α que historicamente fecha metade dos acordos similares. Limiar R$ 4.000 filtra micro-processos onde o custo fixo Cp=R$1.408 domina (não compensa acordar).

---

## 10. Overrides Determinísticos

Features vindas do extrator de PDFs (IFP v2, score de fraude, detecção de contrato) **não estão na base de 60k** que treinou A/B. Entram como **overrides binários de borda** — sem calibração numérica arbitrária:

| Condição | Decisão forçada | Razão |
|---|---|---|
| IFP ≥ 0.75 | DEFESA | `IFP_FORTE` |
| IFP ≤ 0.30 | ACORDO | `IFP_FRACO` |
| `tem_contrato` + `tem_comprovante` + `laudo_favoravel` + `score_fraude < 0.30` | DEFESA | `DOCUMENTACAO_COMPLETA_SEM_FRAUDE` |
| `score_fraude > 0.70` + sem contrato | ACORDO | `FRAUDE_CONFIRMADA_SEM_CONTRATO` |
| Qualquer outra | ML decide | — |

Thresholds em [config.py](../src/backend/modelo/config.py). Razão do override sempre retornada no output (`razao_override`) para auditoria.

---

## 11. Resumo: o que cada modelo recebe e devolve

| Modelo | Input | Output | Treino |
|---|---|---|---|
| **A (P(L))** | 14 features | `float ∈ [0,1]` (prob. calibrada) | 48k processos, target `Resultado macro` |
| **B (Vc)** | 14 features | `float ∈ R+` (R$) | 14.6k perdas, target `log(Vc)` |
| **B' (IC)** | 14 features | `[q10, q50, q90]` (R$) | 14.6k perdas, pinball loss |
| **α** | 14 features | `{0.15, 0.30, 0.50, 0.75, 0.90: α}` | 280 acordos reais, pinball loss |

Todos os modelos são XGBoost, treinados com `random_state=42`, usando as mesmas 14 features montadas por [features.py](../src/backend/modelo/features.py). As predições são combinadas pela fórmula financeira em [motor_decisao.py](../src/backend/modelo/motor_decisao.py).

---

## 12. Como retreinar

```bash
conda activate ENTER
conda run -n ENTER python -m src.backend.modelo.motor_decisao
```

Executa em sequência:
1. `features.carregar_base()` + `build_features(fit=True)` — salva encoder e stats de target encoding.
2. `modelo_probabilidade_perda.treinar()` — Modelo A calibrado.
3. `modelo_estimativa_condenacao.treinar()` — Modelo B + B' quantis.
4. `modelo_alpha.treinar_modelo_alpha()` — Modelo α.
5. Demo de 5 casos sintéticos.

Todos os artefatos caem em [src/backend/modelo/modelos_treinados/](../src/backend/modelo/modelos_treinados/). Para retreinar apenas um, rodar o módulo diretamente:

```bash
conda run -n ENTER python -m src.backend.modelo.modelo_alpha
```

---

## 13. Referências internas

- [CLAUDE.md](../CLAUDE.md) — visão geral do repo
- [src/backend/modelo/](../src/backend/modelo/) — código
- [src/backend/modelo/modelos_treinados/](../src/backend/modelo/modelos_treinados/) — artefatos
- [scripts/pipeline.py](../scripts/pipeline.py) — pipeline end-to-end (extrator + IFP + motor)
- [docs/arquitetura-ifp.md](arquitetura-ifp.md) — IFP (upstream do motor)
