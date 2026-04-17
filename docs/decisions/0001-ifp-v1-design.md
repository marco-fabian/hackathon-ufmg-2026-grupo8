# ADR 0001 — Desenho do IFP v1 (Índice de Força Probatória)

**Status:** Aceito
**Data:** 2026-04-17
**Autor:** Marco (Normalização + IFP)

---

## Contexto

A solução do Grupo 8 para o hackathon Enter precisa decidir, para cada processo do Banco UFMG, entre **defesa** ou **acordo**. A decisão depende fortemente da documentação que o banco enviou (os 6 tipos de subsídio). Precisamos de uma métrica única, interpretável, que sirva como:

- **Input numérico** para o motor de decisão (threshold ou feature),
- **Sinal visual** (termômetro) na UI do advogado,
- **Justificativa auditável** (breakdown por documento) para explicar o "porquê" da recomendação.

Essa métrica é o **Índice de Força Probatória (IFP)**, um score 0–100.

## Restrições e Achados que Guiam a Decisão

A exploração da base de 60k sentenças trouxe números concretos (ver `CLAUDE.md` → "Achados empíricos"):

- **Qtd de subsídios é quase determinística:** 0 docs → 0% êxito; 6 docs → 96% êxito. A ausência de documentos é o sinal mais forte.
- **Lift por documento** (p.p. de aumento em taxa de êxito quando presente vs ausente):
  - Contrato +63 · Extrato +63 · Comprovante +27 · Demonstrativo +12 · Dossiê ~0 · Laudo ~0.
- A base é **sintética** (UF perfeitamente uniforme, PDFs com rodapé "Documento fictício - Hackathon UFMG 2026"). Dossiê e Laudo terem lift zero provavelmente reflete o desenho da organização — não a realidade jurídica.
- **Prazo apertado:** IFP v1 precisa rodar sem LLM (segundos para 60k casos) para destravar o resto do time.

## Decisão

### 1. IFP v1 é calculado **apenas com presença/ausência** dos 6 subsídios

- Sem extração de PDFs, sem chamadas a LLM.
- Entrada: aba "Subsídios disponibilizados" do xlsx (60k × 6 booleans).
- Saída: score 0–100 + tier + breakdown por documento.

### 2. Pesos por documento (presença) — IFP v1

| Documento | Peso | Justificativa |
|---|---|---|
| Contrato | **22** | Lift empírico +63 p.p.; juridicamente central (instrumento firmado). |
| Extrato | **22** | Lift +63 p.p.; prova que o dinheiro entrou e foi movimentado. |
| Comprovante BACEN | **15** | Lift +27 p.p.; evidência regulatória externa. |
| Demonstrativo | **12** | Lift +12 p.p.; útil para contar parcelas pagas (feature v2). |
| Dossiê | **14** | Lift ~0 na base sintética, mas juridicamente decisivo (assinatura, liveness). Peso mantido por relevância de domínio. |
| Laudo | **15** | Lift ~0 na base, mas contém canal + evidências digitais (device, IP, biometria). Peso mantido. |
| **Total** | **100** | |

**Por que não seguir cegamente o lift estatístico:** os pesos acima já desviam do "ótimo" empírico, especialmente para Dossiê e Laudo. A decisão consciente é **aceitar uma perda pequena de acurácia na base histórica para ganhar validade jurídica** — o modelo não pode ignorar um Dossiê biométrico na apresentação sob o argumento de que "a base sintética não viu diferença".

**Tradeoff registrado para a apresentação:** se o avaliador perguntar por que pesos não são proporcionais ao lift, a resposta é essa.

### 3. Tiers

```
IFP >= 75   →  FORTE     →  recomendação padrão: DEFESA
50 <= IFP < 75  →  MÉDIO  →  zona cinzenta: motor de decisão pondera com outras variáveis
IFP < 50    →  FRACO     →  recomendação padrão: ACORDO
```

Cutoffs escolhidos olhando a escada empírica: 5 docs = 87% êxito (≈75 pontos no IFP v1) e 3 docs = 34% êxito (≈49 pontos). Ou seja, os tiers acompanham os pontos de inflexão naturais da curva.

### 4. Schema de saída (contrato com o resto do time)

```json
{
  "processo_id": "0801234-56.2024.8.10.0001",
  "sub_assunto": "Golpe | Genérico",
  "ifp": {
    "score": 87,
    "tier": "FORTE",
    "versao": "v1"
  },
  "subsidios": {
    "contrato":      {"presente": true, "peso_aplicado": 22},
    "extrato":       {"presente": true, "peso_aplicado": 22},
    "comprovante":   {"presente": true, "peso_aplicado": 15},
    "demonstrativo": {"presente": true, "peso_aplicado": 12},
    "dossie":        {"presente": false, "peso_aplicado": 0},
    "laudo":         {"presente": true, "peso_aplicado": 15}
  },
  "sinais_ausentes": ["dossie"],
  "reasoning_curto": "5 de 6 subsídios presentes; falta Dossiê de verificação."
}
```

**Estabilidade do schema:** os campos `ifp.score`, `ifp.tier`, `subsidios.*.presente` e `sinais_ausentes` são **contrato estável v1+**. O IFP v2 adiciona:

- `subsidios.*.features` (extraídas via LLM),
- `ifp.componentes.{presenca, qualidade}` (quebra do score),
- `sinais_fortes` (lista de features positivas encontradas).

Consumidores (motor, front) podem ler v1 hoje e v2 depois sem quebrar.

## Consequências

### Positivas

- Roda em segundos para 60k processos, sem custo de LLM.
- Desbloqueia paralelo: motor de decisão já pode treinar em cima da feature `ifp_score`; front já pode renderizar o termômetro com dados reais.
- Schema estável permite evolução para v2 sem quebrar integrações.
- Pesos auditáveis e defensáveis na apresentação (mistura de lift estatístico + relevância jurídica).

### Negativas / Limitações

- Não captura **qualidade** do documento: um Contrato sem assinatura vale o mesmo que um assinado.
- Pesos de Dossiê e Laudo são parcialmente "chutados" (justificados por domínio, não por dados).
- Calibração é baseada em base sintética — risco de over-fit ao desenho da organização.

### O que o IFP v2 vai resolver

- Extração via LLM (Structured Outputs) das features internas de cada PDF.
- Componente de "qualidade" (0–40) somado à presença (0–60).
- Features derivadas cross-documento (ex: `extrato.autor_movimentou_dinheiro AND demonstrativo.parcelas_pagas >= 3`).
- Re-calibração dos pesos via regressão/XGBoost nos 60k casos.

## Próximos Passos

1. `src/explore.py` — reproduz os achados da base (uma fonte única de verdade para o time).
2. `src/ifp_v1_heuristico.py` — função `compute_ifp_v1(subsidios: dict) -> dict` + batch sobre o xlsx gerando `data/ifp_v1.parquet` (não versionado).
3. Validar nos casos-exemplo: Caso_01 (6 docs) deve dar IFP=100 FORTE; Caso_02 (faltam Contrato, Extrato, Dossiê) deve dar IFP=42 FRACO.
4. Publicar schema em `docs/schemas/ifp.json` e alinhar com motor + front.
