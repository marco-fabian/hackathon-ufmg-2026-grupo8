# Integração com o IFP

Guia prático para o integrante que vai construir o **motor de decisão**. Esta doc cobre **apenas** como consumir o IFP — a lógica do motor (regras/ML, sugestão de valor, etc.) fica a seu critério.

> Este documento descreve o estado atual da branch `backend`. Para o raciocínio por trás das escolhas, veja [ADR 0001](decisions/0001-ifp-v1-design.md) e [ADR 0002](decisions/0002-ifp-v2-extraction.md). Para o fluxo geral, veja [arquitetura-ifp.md](arquitetura-ifp.md).

---

## TL;DR

O IFP fornece **dois artefatos** que você pode consumir:

| # | Onde | O quê | Quando usar |
|---|---|---|---|
| 1 | `data/training.csv` | 60k processos com `ifp_score`, `ifp_tier`, presença dos 6 subsídios, outcome real e split train/val | **Treinar** seu motor (ML) |
| 2 | função `compute_ifp_v2(pasta)` → JSON | Score + breakdown detalhado de um caso novo (via LLM sobre os PDFs) | **Aplicar** o motor em tempo real |

Os dois compartilham o mesmo **schema** formal em [`docs/schemas/ifp.json`](schemas/ifp.json).

---

## 1. Integração batch (treino do motor)

### Arquivo

```
data/training.csv      # 60.000 linhas, 19 colunas, UTF-8
```

Gerado por `python src/dataset_treino.py`. Não é versionado — rode o script uma vez para produzir.

### Colunas

| Coluna | Tipo | Descrição |
|---|---|---|
| `processo_id` | str | Número CNJ |
| `uf` | str | Sigla da UF (26 estados) |
| `sub_assunto` | str | `Golpe` ou `Genérico` |
| `valor_causa` | float | Valor da causa em R$ |
| `valor_cond` | float | Valor da condenação (0 quando banco ganhou) |
| `res_macro` | str | `Êxito` ou `Não Êxito` |
| `res_micro` | str | `Improcedência` · `Extinção` · `Parcial procedência` · `Procedência` · `Acordo` |
| `banco_ganhou` | int (0/1) | **Target binário** derivado do `res_macro` |
| `houve_condenacao` | int (0/1) | Target auxiliar |
| `tem_contrato` · `tem_extrato` · `tem_comprovante` · `tem_dossie` · `tem_demonstrativo` · `tem_laudo` | int (0/1) | Presença de cada subsídio |
| `qtd_docs` | int (0–6) | Soma dos `tem_*` |
| `ifp_score` | int (0–100) | **Feature principal do IFP v1** |
| `ifp_tier` | str | `FORTE` · `MÉDIO` · `FRACO` |
| `split` | str | `train` (48k) ou `val` (12k) — estratificado por `res_macro` |

### Recomendação de uso

```python
import pandas as pd

df = pd.read_csv("data/training.csv")
train = df[df["split"] == "train"]
val   = df[df["split"] == "val"]

features = ["ifp_score", "qtd_docs", "sub_assunto", "valor_causa",
            "tem_contrato", "tem_extrato", "tem_comprovante",
            "tem_dossie", "tem_demonstrativo", "tem_laudo"]
target = "banco_ganhou"

X_train = pd.get_dummies(train[features], columns=["sub_assunto"])
y_train = train[target]
# treinar XGBoost / LogReg / o que preferir
```

### Baseline já validado (só com IFP v1)

Se você só olhar para o `ifp_tier`, já tem um classificador decente:

| Tier | % banco ganhou | Condenação média |
|---|---|---|
| FORTE (≥75) | 90,5% | R$ 999 |
| MÉDIO (50-74) | 63,2% | R$ 3.896 |
| FRACO (<50) | 11,7% | R$ 9.336 |

Ou seja: seu motor pode começar com **"FORTE → defender, FRACO → acordo, MÉDIO → usar ML"** e já ter ~85% de acerto.

---

## 2. Integração live (aplicar o motor num caso novo)

### API Python

```python
from ifp_v2 import compute_ifp_v2
from pathlib import Path

resultado = compute_ifp_v2(
    pasta_processo=Path("data/Caso_01"),
    processo_id="0801234-56.2024.8.10.0001",  # opcional
)
```

Retorno: `dict` (TypedDict `IFPResultV2`) aderente ao schema em [`docs/schemas/ifp.json`](schemas/ifp.json).

### Requisitos

- Python 3.11+
- `pip install -r requirements.txt`
- `.env` com `OPENAI_API_KEY` válida (a organização fornece)
- Pasta com PDFs nomeados como nos casos-exemplo (ex: `02_Contrato_*.pdf`)

### Estrutura da pasta de entrada

```
Caso_X/
├── 01_Autos_*.pdf              ← petição inicial (ignorada pelo IFP)
├── 02_Contrato_*.pdf           ← subsídio: contrato
├── 03_Extrato_*.pdf            ← subsídio: extrato
├── 04_Comprovante_*.pdf        ← subsídio: comprovante BACEN
├── 05_Dossie_*.pdf             ← subsídio: dossiê grafotécnico
├── 06_Demonstrativo_*.pdf      ← subsídio: evolução da dívida
└── 07_Laudo_*.pdf              ← subsídio: laudo referenciado
```

PDFs ausentes são tratados como subsídio faltante (`presente: false`, `peso_aplicado: 0`). A classificação é por **regex no nome** do arquivo — se o caso real vier com nomes diferentes, avise e a gente ajusta o classificador.

### Exemplo de output (Caso_01 — IFP forte)

```json
{
  "processo_id": "0801234-56.2024.8.10.0001",
  "ifp": {
    "score": 100,
    "tier": "FORTE",
    "versao": "v2",
    "componentes": { "presenca": 60, "qualidade": 40 }
  },
  "subsidios": {
    "contrato": {
      "presente": true,
      "peso_aplicado": 13,
      "features": {
        "numero_contrato": "502348719",
        "nome_tomador": "MARIA DAS GRAÇAS SILVA PEREIRA",
        "cpf_tomador": "456.789.123-45",
        "valor_liberado": 5000.0,
        "qtd_parcelas": 72,
        "taxa_juros_am": 1.87,
        "cet_aa": 28.41,
        "canal_contratacao": "correspondente",
        "assinatura_tomador_presente": true
      }
    },
    "extrato": {
      "presente": true,
      "peso_aplicado": 13,
      "features": {
        "credito_emprestimo_aparece": true,
        "valor_credito": 5000.0,
        "autor_movimentou_dinheiro": true,
        "tipos_movimentacao": ["TED", "PIX", "SAQUE"],
        "valor_total_movimentado": 4985.0,
        "destinatarios_suspeitos": false
      }
    },
    "comprovante":   { "presente": true, "peso_aplicado": 9, "features": { "...": "..." } },
    "demonstrativo": { "presente": true, "peso_aplicado": 7, "features": { "qtd_parcelas_pagas": 21, "..." : "..." } },
    "dossie":        { "presente": true, "peso_aplicado": 9, "features": { "assinatura_confere": true, "..." : "..." } },
    "laudo":         { "presente": true, "peso_aplicado": 9, "features": { "tem_gravacao_voz": true, "..." : "..." } }
  },
  "sinais_fortes": [
    "extrato_autor_movimentou_dinheiro",
    "demonstrativo_21_parcelas_pagas",
    "dossie_assinatura_confere",
    "laudo_evidencia_digital(gravacao_voz)"
  ],
  "sinais_ausentes": [],
  "reasoning_curto": "IFP v2 = 100 (FORTE). Todos os 6 subsídios presentes; qualidade 40/40."
}
```

Exemplos reais e completos estão em [`docs/examples/ifp_v2_caso_01.json`](examples/ifp_v2_caso_01.json) e [`docs/examples/ifp_v2_caso_02.json`](examples/ifp_v2_caso_02.json) — use esses para desenvolver sem precisar rodar o LLM.

---

## 3. Campos que você provavelmente vai usar

Para um motor enxuto, estes são os campos que carregam quase toda a informação:

| Campo | Significado para a decisão |
|---|---|
| `ifp.score` (0–100) | Força probatória global |
| `ifp.tier` | Atalho interpretável |
| `subsidios.contrato.presente` · `subsidios.extrato.presente` | Os dois subsídios com maior lift (+63 p.p. cada) |
| `subsidios.extrato.features.autor_movimentou_dinheiro` | Se `true`, alegação de "não reconheço" fica frágil |
| `subsidios.demonstrativo.features.qtd_parcelas_pagas` | Quantas parcelas o autor pagou antes de contestar |
| `subsidios.dossie.features.assinatura_confere` | Perícia grafotécnica validou |
| `subsidios.laudo.features.tem_biometria_facial` · `tem_device_fingerprint` · `tem_geolocalizacao` · `tem_gravacao_voz` | Evidências digitais de autoria |
| `sinais_fortes` | Lista pronta de sinais positivos encontrados (human-readable) |
| `sinais_ausentes` | Lista de subsídios faltantes |

Você é livre para ignorar campos e usar só o que faz sentido na sua lógica.

---

## 4. Dados que o IFP **NÃO** fornece

O IFP olha só para os **subsídios do banco** — coisas que o **motor precisará buscar em outro lugar** se quiser usar:

- `valor_causa` — está na petição inicial (Autos), não nos subsídios. Se precisar, avise e a gente adiciona um extractor de Autos.
- Dados da parte autora (idade, perfil, alegação específica) — também na petição.
- Jurisprudência / casos similares — fora do escopo atual.
- Red flags da petição (BO registrado, alegação de golpe, conta terceiro) — idem.

Se você precisar desses campos, conversa com o time que a gente expande.

---

## 5. Edge cases

- **Subsídio ausente:** `subsidios.<tipo>.presente = false`, `peso_aplicado = 0`, `features = null`.
- **LLM não extraiu um campo:** campos `Optional` vêm como `null`; campos booleanos default para `false`.
- **Caso_02** é um bom "canário" — faltam 3 subsídios críticos (contrato, extrato, dossiê). IFP v2 = 42, tier FRACO.
- **Classificação por nome falha:** se um PDF não casar com nenhum regex, é ignorado silenciosamente (Autos, por exemplo). Se precisar de melhor detecção, avisar.
- **Custo de LLM:** ~US$ 0,03 por caso (6 docs × `gpt-4o-mini`). Não é problema pra demo; seria um ponto a repensar em produção.

---

## 6. Contrato de estabilidade

**Não vão mudar** (seguro depender em produção):

- Nomes dos tipos de subsídio: `contrato`, `extrato`, `comprovante`, `dossie`, `demonstrativo`, `laudo`
- Campos `ifp.score`, `ifp.tier`, `ifp.versao`
- `subsidios.*.presente`, `subsidios.*.peso_aplicado`
- `sinais_ausentes`, `reasoning_curto`
- Cutoffs de tier (75/50)
- Schema em `docs/schemas/ifp.json` (mudanças seguem versionamento)

**Podem mudar** (não dependa do formato exato):

- Conteúdo de `subsidios.*.features` — campos podem ser adicionados a cada extractor
- `sinais_fortes` — strings podem ser renomeadas para ficar mais legíveis
- `reasoning_curto` — texto livre, usar só para UI

---

## 7. Rodando localmente

```bash
# Uma vez
cp .env.example .env                          # e preencher OPENAI_API_KEY
pip install -r requirements.txt

# Batch (gera training.csv)
python src/dataset_treino.py

# Live (gera JSONs em docs/examples/)
python src/demo_v2.py
```

Se algo quebrar, o `SETUP.md` tem o passo a passo completo e os ADRs explicam o porquê de cada decisão.

---

## 8. Ponto de contato

Qualquer campo que você precise, extractor a adicionar ou dúvida sobre comportamento: **abre uma issue ou me chama**. O schema é estável, mas as features internas podem evoluir se ajudar o motor.
