# Arquitetura do IFP

Fluxo atual do Índice de Força Probatória implementado na branch `backend`.
Dois modos de operação que compartilham o mesmo schema de saída.

## Diagrama

```mermaid
flowchart TB
    subgraph DADOS["📁 data/"]
        XLSX["Hackaton_Enter_Base<br/>_Candidatos.xlsx<br/>(60k × 6 booleans)"]
        PDFS["Caso_01/ · Caso_02/<br/>(PDFs reais)"]
    end

    subgraph V1["⚙️ IFP v1 — Produção (60k, SEM LLM)"]
        EXP["src/explore.py<br/>analisa a base"]
        COMPUTE1["src/ifp_v1_heuristico.py<br/>compute_ifp_v1(subsidios)"]
        PESOS["Pesos heurísticos<br/>Contrato 22 · Extrato 22<br/>Comprovante 15 · Laudo 15<br/>Dossiê 14 · Demonstrativo 12"]
        TIER["Tier:<br/>≥75 FORTE · 50-74 MÉDIO · <50 FRACO"]
        DS["src/dataset_treino.py<br/>junta outcome + IFP + split"]
    end

    subgraph V2["🤖 IFP v2 — Demo live (PDFs, COM LLM)"]
        CLF["classify(filename)<br/>regex"]
        EXTRACT["src/extractors/<br/>contrato · extrato · comprovante<br/>dossie · demonstrativo · laudo<br/>+ base.py (load_pdf + LLM call)"]
        SO["OpenAI gpt-4o-mini<br/>Structured Outputs<br/>(Pydantic models)"]
        COMPUTE2["src/ifp_v2.py<br/>compute_ifp_v2(pasta)"]
        QUAL["Presença 0-60<br/>+<br/>Qualidade 0-40"]
        SINAIS["sinais de qualidade:<br/>extrato.autor_movimentou +15<br/>demonstrativo.parcelas_pagas≥3 +10<br/>dossie.assinatura_confere +8<br/>laudo.evidência_digital +7"]
    end

    subgraph CONTRATO["📜 Contrato compartilhado"]
        SCHEMA["docs/schemas/ifp.json<br/>(v1 + v2 num schema só)"]
    end

    subgraph OUT["📤 Outputs"]
        CSV1[("data/ifp_v1.csv<br/>60k linhas")]
        CSV2[("data/training.csv<br/>60k linhas<br/>19 colunas<br/>split 80/20")]
        JSON1[("docs/examples/<br/>ifp_v2_caso_01.json<br/>(100 FORTE)")]
        JSON2[("docs/examples/<br/>ifp_v2_caso_02.json<br/>(42 FRACO)")]
    end

    subgraph CONSUMIDORES["👥 Consumidores"]
        MOTOR["Motor de decisão<br/>(outro integrante)"]
        FRONT["Front-end<br/>(outro integrante)"]
    end

    XLSX --> EXP
    XLSX --> COMPUTE1
    XLSX --> DS
    PESOS -.-> COMPUTE1
    COMPUTE1 --> TIER
    COMPUTE1 --> CSV1
    COMPUTE1 --> DS
    DS --> CSV2

    PDFS --> CLF
    CLF --> EXTRACT
    EXTRACT --> SO
    SO --> EXTRACT
    EXTRACT --> COMPUTE2
    SINAIS -.-> COMPUTE2
    COMPUTE2 --> QUAL
    COMPUTE2 --> JSON1
    COMPUTE2 --> JSON2

    SCHEMA -. valida .-> CSV2
    SCHEMA -. valida .-> JSON1
    SCHEMA -. valida .-> JSON2

    CSV2 --> MOTOR
    JSON1 --> FRONT
    JSON2 --> FRONT
    SCHEMA --> MOTOR
    SCHEMA --> FRONT

    style V1 fill:#e8f4ff,stroke:#0369a1
    style V2 fill:#fff7e8,stroke:#b45309
    style CONTRATO fill:#f0fdf4,stroke:#166534
    style CONSUMIDORES fill:#fdf2f8,stroke:#9f1239
```

## Como ler

**IFP v1 (azul) — batch, sem LLM:**

- Lê só a matriz booleana de presença da aba "Subsídios" do xlsx.
- Aplica pesos heurísticos (soma 100) calibrados pelo lift empírico da base.
- Produz `data/ifp_v1.csv` com score/tier para os 60k processos.
- Alimenta `data/training.csv` (outcome + presença + IFP + split 80/20 estratificado) pro motor de decisão treinar.
- **Uso real:** produção histórica e feature pro motor.

**IFP v2 (laranja) — live, com LLM:**

- Lê uma pasta de processo com PDFs.
- Classifica cada PDF por regex no nome (ex: `02_Contrato_*.pdf` → `contrato`).
- Chama um extractor por tipo, cada um com Pydantic model + `gpt-4o-mini` via Structured Outputs.
- Compõe score como presença (0-60) + qualidade (0-40), onde qualidade premia sinais específicos cross-documento.
- **Uso real:** demo ao vivo nos 2 casos-exemplo. Não escala pros 60k porque a base histórica não contém PDFs.

**Contrato compartilhado (verde):**

- [`docs/schemas/ifp.json`](schemas/ifp.json) define os campos estáveis consumidos por motor e front.
- Versão `v1` e `v2` coexistem no mesmo schema — `componentes`, `features` e `sinais_fortes` são opt-in em v2. Consumidores v1 seguem funcionando quando o output é v2.

**Consumidores (rosa):**

- Motor de decisão treina em cima de `training.csv` ou aplica regras sobre o JSON do IFP.
- Front-end renderiza os JSONs de exemplo (`ifp_v2_caso_*.json`) para o termômetro de força probatória.

## Referências

- [ADR 0001 — Desenho do IFP v1](decisions/0001-ifp-v1-design.md)
- [ADR 0002 — IFP v2 (extração via LLM + camada de qualidade)](decisions/0002-ifp-v2-extraction.md)
- [Schema formal](schemas/ifp.json)
