# Motor de Decisao Juridica — Grupo 8

**Hackathon UFMG 2026 · Enter AI Challenge**

**Video demo:** https://www.loom.com/share/6dd49ab9203e49f8858d041a0dfd80e5

**Apresentacao:** [docs/presentation.pdf](docs/presentation.pdf)

---

## Problema

O Banco UFMG recebe ~5 mil processos/mes de pessoas alegando nao reconhecimento de contratacao de emprestimo. Para cada processo, o banco precisa decidir: **defender-se** ou **propor acordo** — e, se acordo, **qual valor oferecer**.

---

## Solucao

Motor de decisao baseado em ML que, dado um processo, retorna:

- `DEFESA` ou `ACORDO`
- Valor sugerido de acordo (quando aplicavel)
- Probabilidade de perda + estimativa de condenacao com intervalo de confianca
- Explicacao em linguagem natural para o advogado

---

## Arquitetura

```
Processo
  -> [Modelo A]  P(perda)          XGBoost calibrado (Platt)
  -> [Modelo B]  Vc estimado       XGBoost regressao (log1p) + 3 quantis
  -> [alpha]     razao acordo/Vc   XGBoost quantile (5 quantis, 280 acordos reais)

E[C_defesa] = P(L) * Vc + Cp

  E[C_defesa] > Limiar?
    SIM  ->  V_acordo = alpha * E[C_defesa]   ->  ACORDO
    NAO  ->  DEFESA

  [Overrides documentais: IFP, score_fraude, contratos]
```

Tres politicas configuradas: **Conservadora**, **Moderada** (default), **Arriscada** — cada uma um par (quantil alpha, limiar).

---

## Metricas

| Modelo | Metrica | Valor |
|--------|---------|-------|
| A — P(perda) | AUC-ROC | **0.919** |
| A — P(perda) | ECE (calibracao) | 0.026 |
| B — Condenacao | MAE | R$ 2.449 |
| B — Condenacao | R² | 0.563 |
| B' — Quantis | Cobertura IC 80% | 73.4% |

---

## Quick Start

```bash
# 1. Instalar dependencias
conda activate ENTER
pip install -r src/backend/requirements-backend.txt

# 2. Configurar variaveis de ambiente
cp .env.example .env   # OPENAI_API_KEY opcional

# 3. Rodar pipeline end-to-end em um processo de exemplo
conda run -n ENTER python scripts/pipeline.py data/Caso_01
# output em scripts/output/Caso_01.json
```

Ver [SETUP.md](SETUP.md) para instrucoes completas de instalacao e uso programatico.

---

## Estrutura

```
.
├── data/
│   ├── Hackaton_Enter_Base_Candidatos.xlsx   # 60k processos (nao versionado)
│   ├── banco_treino.csv                      # dataset processado
│   └── Caso_01/ Caso_02/                     # processos-exemplo com PDFs
├── docs/                                     # documentacao tecnica e ADRs
├── scripts/
│   ├── pipeline.py                           # pipeline end-to-end (extrator + IFP + motor)
│   └── output/                               # JSONs de saida
└── src/
    ├── extractors/                           # extratores de PDF por tipo de documento
    ├── agentes/                              # agente de analise de fraude
    ├── ifp_v2.py                             # indice de forca probatoria (IFP v2)
    ├── pipeline.py                           # orquestrador
    └── backend/
        ├── api.py                            # FastAPI
        ├── api_db_dash/                      # endpoints do dashboard
        └── modelo/                           # motor de decisao ML
            ├── motor_decisao.py
            ├── modelo_probabilidade_perda.py
            ├── modelo_estimativa_condenacao.py
            ├── modelo_alpha.py
            ├── explicador.py
            └── modelos_treinados/            # artefatos treinados
```

---

## Documentacao

- [docs/modelo.md](docs/modelo.md) — arquitetura ML completa, metricas, decisoes de design
- [docs/decisions/](docs/decisions/) — ADRs
- [SETUP.md](SETUP.md) — instalacao, uso programatico, comandos de treino
