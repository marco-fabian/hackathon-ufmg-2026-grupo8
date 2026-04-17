# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexto do Projeto

Hackathon UFMG 2026 — Enter AI Challenge (17–18/04/2026). Grupo 8. Prazo de submissão: 18/04 04:00; apresentação: 18/04 07:00.

**Problema:** Banco UFMG recebe ~5 mil ações/mês de pessoas alegando "não reconhecimento de contratação de empréstimo". O banco precisa decidir, caso a caso, entre **defesa** ou **acordo**. A solução deve conter:

1. Regra de decisão (acordo vs defesa) a partir dos autos + subsídios
2. Sugestão de valor quando for acordo
3. Acesso prático do advogado à recomendação
4. Monitoramento de aderência pelos advogados
5. Monitoramento de efetividade da política

Leitura completa do desafio em [README.md](README.md).

## Arquitetura Esperada (ainda em construção)

A solução se organiza em módulos que colaboram via contratos JSON. Cada integrante toca uma fatia:

- **Normalização + IFP (Índice de Força Probatória)** — responsabilidade desta branch `backend`. Duas versões:
  - **IFP v1** (`src/ifp_v1_heuristico.py`): presença-based, roda sobre o xlsx de 60k; usado no dataset de treino e na produção histórica. Sem LLM.
  - **IFP v2** (`src/ifp_v2.py` + `src/extractors/`): extrai features dos PDFs via OpenAI Structured Outputs (`gpt-4o-mini`); demo-only porque só há PDFs nos 2 casos-exemplo. Adiciona componente de qualidade (0–40) ao score de presença (0–60).
- **Motor de decisão** (`src/motor_decisao.py`) — consome o IFP v2 + `AutosFeatures` (petição inicial extraída por `src/extractors/autos.py`) e aplica regras por tier: FORTE → DEFENDER, FRACO → ACORDO, MÉDIO → regra 2×2 (Contrato × Extrato). Red flags críticos na petição (BO registrado, autor afirma não ter conta no banco, crédito em conta de terceiro) podem rebaixar decisão em MÉDIO ou diminuir confiança em FORTE. Proposta de acordo = `valor_causa × 0,70 × 0,43` (calibrado empiricamente: razão média condenação/causa na base = 0,704). Pipeline end-to-end em `src/demo_motor.py`. Alternativa futura: XGBoost treinado em `data/training.csv` (já preparado, não implementado).
- **Interface do advogado (front-end)** — consome `docs/schemas/ifp.json` + exemplos em `docs/examples/ifp_v2_*.json` e `docs/examples/decisao_caso_*.json`; renderiza o "termômetro" e a recomendação.

O IFP é o ponto de acoplamento entre as três camadas. Schema estável em [docs/schemas/ifp.json](docs/schemas/ifp.json).

## Dados

Todos os dados reais ficam em `data/` e **não são versionados** (ver `.gitignore`).

- `data/Hackaton_Enter_Base_Candidatos.xlsx` — 2 abas:
  - **Resultados dos processos** (60.000 linhas): nº do processo, UF, Assunto, Sub-assunto (Golpe/Genérico), Resultado macro (Êxito/Não Êxito), Resultado micro (Improcedência/Extinção/Parcial procedência/Procedência/Acordo), Valor da causa, Valor da condenação.
  - **Subsídios disponibilizados** (60.000 linhas, header na linha 1): nº do processo + 6 colunas binárias indicando presença de cada subsídio.
- `data/Caso_01/` e `data/Caso_02/` — 2 processos-exemplo com PDFs reais (Autos + Subsídios). **São sintéticos** ("Documento fictício - Hackathon UFMG 2026" no rodapé). Caso_01 tem os 6 subsídios; Caso_02 tem apenas 3 (falta Contrato, Extrato, Dossiê) — é o "golden test" de IFP baixo.

### Achados empíricos da base (não re-descobrir)

Baseline da base histórica, já computado:

- 69,6% Êxito / 30,4% Não Êxito; apenas 280 acordos (0,47%).
- Sub-assunto **Golpe** (69% dos casos) tem 64% de êxito; **Genérico** tem 83%.
- **Qtd de subsídios** é quase determinística do resultado: 0 docs → 0% êxito; 3 docs → 34%; 4 → 64%; 5 → 87%; 6 → 96%.
- **Lift empírico por documento** (taxa de êxito com − sem):
  - Contrato +63 p.p. · Extrato +63 p.p. · Comprovante BACEN +27 p.p. · Demonstrativo +12 p.p. · Dossiê ~0 · Laudo ~0
  - Dossiê e Laudo têm lift zero na base sintética mesmo sendo juridicamente relevantes — tradeoff a sinalizar na apresentação.
- A base parece **sintética**: UF distribui exatamente em 2308 por estado. Calibrar em cima disso, mas declarar a limitação.

### Estrutura interna dos PDFs de subsídio

Cada tipo de documento segue padrão altamente estruturado (pares chave-valor) → Structured Outputs do OpenAI encaixa bem. Features extraíveis já mapeadas (ver plano em memória da conversa): presença de assinatura, valor/prazo/taxa, canal de contratação, se o extrato mostra o crédito e se o autor movimentou o dinheiro, qtd de parcelas pagas no demonstrativo, validação do dossiê Veritas, evidências digitais no laudo (device fingerprint, geolocalização, gravação).

## Comandos

### Setup do ambiente Python

```bash
python -m pip install pandas openpyxl pdfplumber openai python-dotenv
```

Dependências adicionais (XGBoost, scikit-learn, etc.) serão adicionadas conforme o pipeline evolui.

### Variáveis de ambiente

```bash
cp .env.example .env
# preencher OPENAI_API_KEY (fornecida pela organização)
```

### Explorar a base

```bash
# Abrir o xlsx com pandas (header=1 na aba de subsídios)
python -c "import pandas as pd; print(pd.read_excel('data/Hackaton_Enter_Base_Candidatos.xlsx', sheet_name='Subsídios disponibilizados', header=1).head())"
```

Scripts de exploração e cálculo do IFP vão viver em `src/` conforme o projeto avança.

## Convenções de Trabalho

- **Documentação incremental:** cada etapa construída é registrada em `docs/` (decisões, achados, diffs significativos). Não esperar o final para documentar.
- **Commits por etapa:** cada passo do plano vira um commit com mensagem descritiva. Co-author `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Schemas primeiro, código depois:** antes de implementar qualquer módulo que outro integrante consome (IFP, motor, UI), escrever o contrato JSON e alinhar.
- **Baseline antes de LLM:** o IFP v1 deve rodar só com presença/ausência (xlsx) — sem custo de LLM — e ser suficiente para destravar o resto do time. IFP v2 adiciona a camada de qualidade via extração de PDFs.
- **Custo de LLM é restrição real:** 60k processos × 6 documentos é caro; pensar em amostragem estratificada, cache local e batching antes de rodar em massa.

## Entregáveis da Submissão

Conforme [README.md](README.md#6-formato-de-entrega):

- Repositório público no GitHub no formato `hackathon-ufmg-2026-grupo8`
- `src/` com código-fonte
- `SETUP.md` com instruções de execução reproduzíveis
- `docs/presentation.*` — slides (máx 15 min)
- Vídeo demo de até 2 min mostrando o fluxo do advogado
- Submissão no site `hackathon.getenter.ai` até 18/04 04:00
