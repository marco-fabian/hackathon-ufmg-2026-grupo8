# ADR 0002 — IFP v2 (extração via LLM + camada de qualidade)

**Status:** Aceito
**Data:** 2026-04-17
**Autor:** Marco (Normalização + IFP)
**Sucede:** parcialmente ADR 0001 (v1 continua válido para a base histórica)

---

## Contexto

O IFP v1 (ADR 0001) cobre a produção sobre os 60k processos, mas só enxerga **presença/ausência** dos subsídios. Para o demo ao vivo (2 casos-exemplo com PDFs reais) e para uma recomendação mais precisa, precisamos também olhar **dentro** de cada documento: assinatura confere, autor movimentou o dinheiro, pagou parcelas antes de contestar, o laudo tem evidências digitais, etc.

Essa é a camada de **qualidade** do IFP v2.

## Restrições

- Só há PDFs disponíveis para os 2 casos-exemplo (`data/Caso_01` e `data/Caso_02`). A base de 60k não tem PDFs. Portanto **IFP v2 é demo-only**, não roda em batch.
- A organização fornece chave da OpenAI com créditos. Custo não é restrição severa para 2 casos × 6 documentos.
- Os documentos são altamente estruturados (pares chave-valor padronizados) → Structured Outputs basta. Não precisa de agente.

## Decisão

### 1. Arquitetura de extração: Structured Outputs (não agente)

Um módulo Python por tipo de documento (`src/extractors/<tipo>.py`), cada um com:

- Pydantic model definindo as features que interessam àquele doc.
- Função `extract(pdf_path: Path) -> Model` que carrega o PDF, monta o prompt e chama o LLM com `response_format=Model`.
- Modelo: **`gpt-4o-mini`** (custo baixo, velocidade alta, Structured Outputs nativo).

**Por que não agente:** as features a extrair são conhecidas de antemão; é um formulário, não uma pesquisa. Agente adicionaria latência e custo sem ganho.

### 2. Classificação de documento: regex por nome de arquivo

Os PDFs seguem `02_Contrato_*.pdf`, `03_Extrato_*.pdf`, etc. Mapeamento determinístico por prefixo. **Limitação conhecida:** em produção real o banco enviaria nomes arbitrários, exigindo um classificador semântico. Para a apresentação, declarar como next step.

### 3. Pesos recalibrados v2 (60 presença + 40 qualidade)

**Presença (máx 60):**

| Doc | Peso v1 | Peso v2 (≈ v1 × 0,6) |
|---|---|---|
| contrato | 22 | 13 |
| extrato | 22 | 13 |
| comprovante | 15 | 9 |
| dossie | 14 | 9 |
| laudo | 15 | 9 |
| demonstrativo | 12 | 7 |
| **Total** | **100** | **60** |

**Qualidade (máx 40) — só conta se o doc estiver presente:**

| Sinal | Bonus | Justificativa |
|---|---|---|
| `extrato.autor_movimentou_dinheiro` | +15 | Se o autor sacou/transferiu o dinheiro recebido, a alegação de "não reconheço" cai por terra. |
| `demonstrativo.parcelas_pagas >= 3` | +10 | Pagar várias parcelas antes de contestar indica reconhecimento de fato. |
| `dossie.assinatura_confere` | +8 | Perícia grafotécnica validando assinatura é evidência direta. |
| `laudo.tem_evidencia_digital` (biometria \| device fingerprint \| geolocalização \| gravação de voz) | +7 | Prova digital de autoria. |
| **Total** | **40** | |

### 4. Schema de saída (extende o IFP v1)

Novo campo `ifp.versao = "v2"`, adiciona `ifp.componentes = {presenca, qualidade}` e `subsidios.<doc>.features` com o dict do Pydantic model. Consumidores v1 continuam funcionando — campos novos são opt-in.

### 5. Tiers mantidos (FORTE/MÉDIO/FRACO, cutoffs 75/50)

A escala total continua 0–100, então tiers calibrados no v1 se mantêm. Um FORTE no v2 corresponde ao mesmo "nível de força probatória" de um FORTE no v1.

## Consequências

### Positivas
- Demo ao vivo fica muito mais forte: mostra extração linha a linha em tempo real.
- Justificativa auditável por feature (advogado vê o porquê de cada ponto).
- Escalável: adicionar tipos de docs ou features é trivial (novo módulo em `src/extractors/`).

### Negativas
- Depende de chave da OpenAI estar disponível no dia.
- Custo, embora baixo, existe.
- Classificação por nome de arquivo é frágil (limitação declarada).
- Extração via LLM tem erro residual (~1-5% segundo literatura para docs estruturados) — aceitável, mas advogado precisa poder auditar e corrigir.

## Próximos Passos

1. `src/extractors/base.py` — helpers (load PDF, call LLM).
2. Um módulo por tipo de documento em `src/extractors/`.
3. `src/ifp_v2.py` — orquestrador: recebe pasta, classifica, extrai, calcula score.
4. `src/demo_v2.py` — roda nos dois casos-exemplo e imprime/salva resultado.
5. Snapshot JSON dos resultados em `docs/examples/` (versionado, serve pro front mockar).
