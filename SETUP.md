# Setup e Execução — Grupo 8

## Pré-requisitos

- Python 3.11+
- Chave da OpenAI (fornecida pela organização do hackathon)
- Arquivos de dados fornecidos pela organização em `data/`:
  - `Hackaton_Enter_Base_Candidatos.xlsx` (obrigatório)
  - `Caso_01/` e `Caso_02/` com PDFs (opcional, para demo do IFP v2)

## Instalação

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

## Variáveis de Ambiente

```bash
cp .env.example .env
# Edite .env e preencha OPENAI_API_KEY
```

## Execução

### 1. Explorar a base (reproduz os achados do CLAUDE.md)

```bash
python src/explore.py
```

Imprime distribuição de outcome, lift por documento, escada qtd-docs × êxito e top combinações. Sem side-effects.

### 2. Calcular o IFP v1 (presença-based, 60k processos)

```bash
python src/ifp_v1_heuristico.py
```

- Valida os dois casos-exemplo (sanity check).
- Roda em batch sobre os 60k processos.
- Salva `data/ifp_v1.csv` com colunas `processo, ifp_score, ifp_tier, tem_*, sinais_ausentes`.

### 3. Montar o dataset de treino para o motor de decisão

```bash
python src/dataset_treino.py
```

Junta outcome + presença + IFP + split train/val (80/20 estratificado). Salva em `data/training.csv`.

## Estrutura

```
.
├── CLAUDE.md                         # contexto para agentes
├── README.md                         # descrição do desafio
├── SETUP.md                          # este arquivo
├── requirements.txt
├── data/                             # NÃO VERSIONADO
│   ├── Hackaton_Enter_Base_Candidatos.xlsx
│   ├── Caso_01/ ... Caso_02/
│   ├── ifp_v1.csv                    # gerado por ifp_v1_heuristico.py
│   └── training.csv                  # gerado por dataset_treino.py
├── docs/
│   ├── decisions/0001-ifp-v1-design.md
│   └── schemas/ifp.json
└── src/
    ├── explore.py
    ├── ifp_v1_heuristico.py          # compute_ifp_v1() + batch
    └── dataset_treino.py
```

## Contrato para Outros Módulos

O IFP expõe o schema em [`docs/schemas/ifp.json`](docs/schemas/ifp.json). Motor de decisão e UI devem consumi-lo.

- `compute_ifp_v1(subsidios: dict[str, bool]) -> IFPResult` em [`src/ifp_v1_heuristico.py`](src/ifp_v1_heuristico.py).
- Dataset de treino pronto em `data/training.csv` (via `dataset_treino.py`).
