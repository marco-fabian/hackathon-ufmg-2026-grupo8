# ADR 0003 — Motor de Decisão (defesa vs acordo) e integração com IFP v2

**Status:** Aceito
**Data:** 2026-04-17
**Autor:** Marco (Normalização+IFP) — discutido com colega responsável pelo motor

---

## Contexto

O desafio pede explicitamente (requisitos #1 e #2):

1. **Regra de decisão** — determinar defesa ou acordo.
2. **Sugestão de valor** — quando for acordo.

O colega compartilhou um template inicial baseado em:

- Classificação de documentos por regex no nome (sobreposição total com o IFP v2).
- Regras 2×2 de Contrato × Extrato com probabilidades empíricas de derrota.
- Red flags em keyword matching sobre o texto da petição inicial (Autos).
- Fórmula `valor_causa × 0,70 × 0,43` para proposta de acordo.

O template tem componentes úteis (regras 2×2, red flags, fatores de valor) e componentes redundantes com o IFP v2 (extração e classificação). Precisamos de uma integração que:

1. Evite duplicação (LLM + Structured Outputs já extrai melhor que regex).
2. Preserve as regras interpretáveis do template (2×2 e fatores de valor).
3. Cubra o que ainda falta: análise dos **Autos** (petição inicial) — os extractors atuais só olham os subsídios do banco.

## Decisão

### 1. Divisão de responsabilidades

```
┌─────────────────────────┐
│  src/extractors/*.py    │  Extração por documento via LLM
│  (inclui autos.py novo) │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐     ┌──────────────────────────┐
│  src/ifp_v2.py          │     │  src/extractors/autos.py │
│  (só subsídios do banco)│     │  (petição + red flags)   │
└────────────┬────────────┘     └────────────┬─────────────┘
             │                               │
             └───────────┬───────────────────┘
                         ▼
            ┌───────────────────────────┐
            │  src/motor_decisao.py     │
            │  → DecisaoRecomendada     │
            └───────────────────────────┘
```

- **IFP v2** continua olhando só os 6 subsídios do banco.
- Novo extractor de **Autos** (petição inicial) — não conta para o IFP (não é prova do banco), mas gera `AutosFeatures` com red flags e valor da causa.
- **Motor de decisão** é um módulo separado que consome os dois.

### 2. Lógica do motor

```python
def decidir(ifp_output, autos):
    score, tier = ifp_output["ifp"]["score"], ifp_output["ifp"]["tier"]
    red_flag_critico = (
        autos.tem_boletim_ocorrencia
        or autos.afirma_nao_ter_conta_no_banco
        or autos.menciona_conta_terceiro
    )

    if tier == "FORTE":
        decisao = "DEFENDER"
        confianca = "ALTA" if score >= 85 and not red_flag_critico else "MÉDIA"
    elif tier == "FRACO":
        decisao = "ACORDO"
        confianca = "ALTA"
    else:  # MÉDIO: aplica regra 2×2 + red flags
        tem_c = ifp_output["subsidios"]["contrato"]["presente"]
        tem_e = ifp_output["subsidios"]["extrato"]["presente"]
        decisao = "DEFENDER" if (tem_c and tem_e) else "ACORDO"
        if red_flag_critico:
            decisao = "ACORDO"
        confianca = "MÉDIA"

    valor_sugerido = None
    if decisao == "ACORDO" and autos.valor_causa:
        valor_sugerido = round(autos.valor_causa * 0.70 * 0.43, 2)
    return {...}
```

### 3. Fatores do valor sugerido

Mantidos os do template:

- `FATOR_CONDENACAO = 0,70` — proporção do valor da causa que vira condenação (nosso cruzamento empírico bate: `condenacao / valor_causa` médio na base = **0,704**).
- `FATOR_DESCONTO_ACORDO = 0,43` — acordo ≈ 43% da condenação esperada.
- Acordo sugerido ≈ `valor_causa × 0,301`.

### 4. Red flags críticos (rebaixam confiança de defesa e tendem ACORDO em MÉDIO)

- BO registrado pelo autor.
- Autor afirma não possuir conta no banco.
- Menção a crédito em conta de terceiro.

Red flags não-críticos ficam registrados como sinalização mas não invertem a decisão.

## Descartados do template

- **Classificação por regex e extração por regex** — substituídos por `extractors/*.py` com Structured Outputs (estritamente mais robusto).
- **USE_LLM=0 fallback** — não mantemos rota "só regex". Se API cair no dia, rodamos offline com o IFP v1.
- **Chave hard-coded** — **jamais**. Somente via `.env` (já decidido).

## Consequências

### Positivas
- Motor interpretável (3 ramos de decisão, fórmula simples de valor).
- Red flags compatíveis com a linguagem do advogado ("autor registrou BO" é mais legível que "feature X com peso Y").
- Extração separada facilita trocar motor (futuro: XGBoost treinado em `data/training.csv`).

### Negativas
- Classificação por nome de arquivo continua frágil (já declarado no ADR 0002).
- 2×2 ignora Comprovante/Dossiê/Laudo na zona MÉDIA. Aceitável — o IFP já os ponderou para chegar no tier.
- Sem XGBoost ainda — motor é 100% regras.

## Próximos passos

1. `src/extractors/autos.py` — novo extractor.
2. `src/motor_decisao.py` — função `decidir()`.
3. `src/demo_motor.py` — pipeline end-to-end nos 2 casos.
4. Artefatos de saída em `docs/examples/decisao_caso_*.json`.
