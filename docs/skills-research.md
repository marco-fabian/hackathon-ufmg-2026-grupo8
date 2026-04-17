# Pesquisa de Skills Úteis para o Projeto

Pesquisa em documentação oficial da Anthropic (docs.anthropic.com, code.claude.com) e GitHub (repo `anthropics/skills` + ecossistema comunitário) para identificar skills que aceleram este hackathon.

**Data:** 2026-04-17
**Já disponíveis na sessão (ignorar):** `init`, `review`, `security-review`, `simplify`, `update-config`, `keybindings-help`, `less-permission-prompts`, `loop`, `schedule`, `claude-api`, `n8n-*`.

---

## 1. Skills oficiais da Anthropic (instalar já)

O repo [anthropics/skills](https://github.com/anthropics/skills) é a fonte canônica. Instala tudo de uma vez com:

```
/plugin marketplace add anthropics/skills
```

Isso habilita dois plugins — `document-skills` e `example-skills` — que entregam os itens abaixo.

| Skill | Onde | Por que serve a este projeto |
|---|---|---|
| **pdf** | [skills/pdf](https://github.com/anthropics/skills/tree/main/skills/pdf) | Extração de texto/tabelas/forms com `pdfplumber` + OCR fallback. Substitui boilerplate para ler Autos + 6 subsídios em `data/Caso_01/` e `data/Caso_02/`. |
| **xlsx** | [skills/xlsx](https://github.com/anthropics/skills/tree/main/skills/xlsx) | Lê/edita `.xlsx` com regras de integridade de fórmula. Direto na base de 60k linhas (lembrando do `header=1` na aba Subsídios). |
| **pptx** | [skills/pptx](https://github.com/anthropics/skills/tree/main/skills/pptx) | Gera `docs/presentation.pptx` deliverable (máx 15 min). |
| **frontend-design** | [skills/frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | Guidelines anti-"AI-slop". Vale para o "termômetro" da UI do advogado. |
| **webapp-testing** | [skills/webapp-testing](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) | Playwright black-box + `with_server.py`. Gera screenshots e valida o fluxo — essencial para o vídeo demo de 2 min. |
| **skill-creator** | [skills/skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) | Meta-skill para autorar os skills próprios (abaixo). |

---

## 2. Skills da comunidade que agregam

Só 3 sobreviveram ao filtro (baixa estrela ≠ slop; 284 estrelas também ≠ garantia):

- **[Gabberflast/academic-pptx-skill](https://github.com/Gabberflast/academic-pptx-skill)** (284★) — Disciplina comunicacional para pitch: Minto Pyramid, action titles, teste de "ghost deck", um exhibit por slide. Empilha em cima do `pptx` oficial. **Forte recomendação** para a apresentação de 15 min para a banca.
- **[Samuel-Learnity/prompt-eval-harness](https://github.com/Samuel-Learnity/prompt-eval-harness)** — Dataset congelado + dual grading (LLM judge + validador determinístico) + `iterate()`. Congela `Caso_01` e `Caso_02` como golden cases para medir regressão em cada mudança de prompt de extração de features. Código espelha o curso oficial de prompt engineering — não é slop apesar de 1★.
- **[sfc-gh-wkot/streamlit-from-diagram-skill](https://github.com/sfc-gh-wkot/streamlit-from-diagram-skill)** — Wireframe → Streamlit + validação Playwright. Opcional: só se o MVP da UI for Streamlit. Autor é engenheiro Snowflake.

**Flagged/ignorar:** `rohitg00/awesome-claude-code-toolkit`, `sickn33/antigravity-awesome-skills`, `jeremylongshore/claude-code-plugins-plus-skills`, `ramshres/pandas-data-analysis`, `TomsTools11/csv-data-visualizer`, `Davinci-Meg/pdf2md` — agregadores SEO ou 0★ abandonados.

**ML/XGBoost:** nada maduro encontrado. `dianaprior/kaggle-competition-agent-skill` é TabPFN-first, conflita com a stack; mas o **padrão** dela (parent skill + tasks filhas `core/explore/classify`) serve de template para dividir `ifp-core` + `ifp-v1-presence` + `ifp-v2-quality`.

---

## 3. Skills a autorar neste projeto

Baseado no `CLAUDE.md` e nas convenções (schemas primeiro, baseline antes de LLM, commits por etapa):

### Prioridade 1 — destravar o time
- **`ifp-v1-baseline`** — calcula IFP 0–100 só com presença/ausência (xlsx, sem custo de LLM). Emite JSON no contrato de [docs/schemas/ifp.json](docs/schemas/ifp.json). Toca: `pandas`, `openpyxl`, validador JSON Schema. Frontmatter `disable-model-invocation: true`.
- **`extract-subsidio`** — extrai features estruturadas de cada tipo de subsídio (Contrato, Extrato, Comprovante BACEN, Demonstrativo, Dossiê, Laudo). Encapsula os campos chave-valor já mapeados. Toca: skill `pdf` oficial + schema de Structured Outputs da OpenAI.

### Prioridade 2 — higiene sob pressão
- **`commit-etapa`** — enforça o padrão "commit por etapa" com co-author Claude Opus 4.7. Toca: `Bash(git *)`. Frontmatter `disable-model-invocation: true`, `allowed-tools` restrito.
- **`align-schema`** — valida o contrato JSON do IFP contra `docs/schemas/ifp.json` antes de consumers (motor, UI) integrarem. Toca: `jsonschema`.

### Prioridade 3 — insurance policy (48h antes do deadline)
- **`prepare-submission`** — checklist pré-entrega (17/04 noite): valida `src/`, `SETUP.md`, `docs/presentation.*`, presença de video demo, status do git, URL pública do GitHub. `context: fork` para isolar.

---

## 4. Guia canônico de autoria (bookmark)

- [Claude Code — Extend with skills](https://code.claude.com/docs/en/skills) — SKILL.md format, progressive disclosure, `context: fork`, subagent delegation.
- [Agent Skills — Best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Agent Skills — Overview & quickstart](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- Exemplo vivo: [skills/skill-creator/SKILL.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)

**Regras-chave a lembrar ao escrever skills deste projeto:**
- `description` do frontmatter é o **contrato de ativação**: diga explicitamente *quando* acionar e *quando não*. O skill `xlsx` oficial é um bom modelo.
- Shard referências longas em `REFERENCE.md`, `FORMS.md` etc. (padrão dos skills `pdf`/`pptx`) — carrega sob demanda, poupa contexto.
- `SKILL.md` ≤ 500 linhas; scripts pesados vão em `scripts/`, dados/templates em `assets/`.

---

## 5. Próximos passos sugeridos

1. Rodar `/plugin marketplace add anthropics/skills` e habilitar `document-skills` + `example-skills`.
2. Instalar `academic-pptx-skill` (aula de pitch) e `prompt-eval-harness` (congelar `Caso_01`/`Caso_02`).
3. Autorar `ifp-v1-baseline` primeiro — é 1-2 
