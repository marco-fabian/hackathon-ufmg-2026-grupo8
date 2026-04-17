# Contrato do Extrator → Motor de Decisão

Especificação dos campos que o extrator de PDFs precisa produzir para que o motor de decisão jurídica (`src/backend/modelo/motor_decisao.py`) funcione num caso real.

> Este documento é o contrato **input-only** do motor. Para a lógica interna (ML, overrides, políticas), ver [`CLAUDE.md`](../CLAUDE.md).

---

## TL;DR

O motor consome **um JSON por processo** com 3 campos obrigatórios e 5 opcionais. Formato final esperado:

```json
{
  "processo_id": "0801234-56.2024.8.10.0001",
  "uf": "MA",
  "sub_assunto": "Golpe",
  "valor_causa": 30000.00,
  "features_documentais": {
    "tem_contrato_assinado": true,
    "tem_comprovante_ted": true,
    "laudo_favoravel": true,
    "score_fraude": 0.12,
    "indicio_de_fraude": false
  }
}
```

O motor consome direto:

```python
import json
from src.backend.modelo.motor_decisao import MotorDecisao

motor = MotorDecisao.carregar(policy="Balanceada")
with open("extraction_output/0801234-56.2024.8.10.0001.json") as f:
    payload = json.load(f)

r = motor.decidir(
    uf=payload["uf"],
    sub_assunto=payload["sub_assunto"],
    valor_causa=payload["valor_causa"],
    features_documentais=payload.get("features_documentais"),
)
```

---

## 1. Campos obrigatórios

Vêm do **`01_Autos_Processo_*.pdf`** (petição inicial / autuação). Se algum faltar, o motor **falha**.

| # | Campo | Tipo | Formato aceito | Origem no PDF |
|---|---|---|---|---|
| 1 | `uf` | `str` | Sigla de 2 letras maiúsculas (`"SP"`, `"MA"`, `"MG"`...) | Número CNJ do processo: dígitos após `8.` identificam o tribunal (`8.10.` = TJ-MA, `8.26.` = TJ-SP, etc.) Usar tabela oficial CNJ |
| 2 | `sub_assunto` | `str` | Exatamente `"Golpe"` ou `"Genérico"` (com acento) | Campo "Assunto" da autuação. Se o texto da inicial mencionar "golpe", "fraude", "estelionato", "não reconhece a contratação" → `"Golpe"`; caso contrário → `"Genérico"` |
| 3 | `valor_causa` | `float` | Em R$, sem formatação (`30000.00`, não `"R$ 30.000,00"`) | Campo "Valor da causa" na petição inicial |

**Edge cases:**
- UF fora das 27 brasileiras → o modelo trata como desconhecida (degrada graciosamente, mas preferível evitar)
- `sub_assunto` fora de `{"Golpe", "Genérico"}` → idem
- `valor_causa` zero ou negativo → erro; validar no extrator

---

## 2. Campos opcionais (`features_documentais`)

Vêm da análise dos **demais PDFs** (Contrato, Extrato, Comprovante BACEN, Dossiê, Demonstrativo, Laudo). Passados num sub-dicionário `features_documentais`. Se o dicionário inteiro for `null`/omitido, o motor roda **só com os 3 obrigatórios** — ainda funciona, mas perde os overrides determinísticos.

| # | Campo | Tipo | Faixa / valores | Como derivar |
|---|---|---|---|---|
| 4 | `tem_contrato_assinado` | `bool` | `true` / `false` | `true` se existe PDF de contrato **e** assinatura do tomador detectada como válida |
| 5 | `tem_comprovante_ted` | `bool` | `true` / `false` | `true` se existe comprovante BACEN **ou** o extrato mostra TED para a conta do autor |
| 6 | `laudo_favoravel` | `bool` | `true` / `false` | `true` se o laudo referenciado traz qualquer evidência digital pró-banco (biometria facial, device fingerprint, geolocalização, gravação de voz) |
| 7 | `score_fraude` | `float` | `[0.0, 1.0]` | `0.0` = nenhum sinal de fraude na alegação do autor; `1.0` = fraude confirmada. Se não conseguir calcular, passe `0.5` (neutro) |
| 8 | `indicio_de_fraude` | `bool` | `true` / `false` | `true` se o dossiê grafotécnico diz que assinatura **não** confere **ou** o extrato tem destinatários suspeitos |

**Valores default** (se um campo específico faltar dentro de `features_documentais`):
- Booleanos: `false`
- `score_fraude`: `0.5` (neutro)

---

## 3. Regras que os opcionais disparam

Quando `features_documentais` é fornecido, o motor aplica **overrides determinísticos** antes do modelo ML:

| Condição | Decisão forçada | Razão registrada |
|---|---|---|
| `tem_contrato_assinado` **E** `tem_comprovante_ted` **E** `laudo_favoravel` **E** `score_fraude < 0.30` | `DEFESA` | `DOCUMENTACAO_COMPLETA_SEM_FRAUDE` |
| `score_fraude > 0.70` **E** `NOT tem_contrato_assinado` | `ACORDO` | `FRAUDE_CONFIRMADA_SEM_CONTRATO` |
| Qualquer outro caso (zona cinza) | — | Modelo ML decide |

Thresholds em [`src/backend/modelo/config.py`](../src/backend/modelo/config.py): `OVERRIDE_SCORE_FRAUDE_BAIXO = 0.30`, `OVERRIDE_SCORE_FRAUDE_ALTO = 0.70`.

---

## 4. Formato de entrega sugerido

**Um arquivo JSON por processo**, nomeado com o ID do processo:

```
extraction_output/
├── 0801234-56.2024.8.10.0001.json
├── 0899999-99.2024.8.10.0002.json
└── ...
```

Estrutura de cada arquivo (campo `processo_id` é opcional, usado só para rastreabilidade):

```json
{
  "processo_id": "0801234-56.2024.8.10.0001",
  "uf": "MA",
  "sub_assunto": "Golpe",
  "valor_causa": 30000.00,
  "features_documentais": {
    "tem_contrato_assinado": true,
    "tem_comprovante_ted": true,
    "laudo_favoravel": true,
    "score_fraude": 0.12,
    "indicio_de_fraude": false
  }
}
```

### Exemplos de casos de borda

**Caso com documentação fraca (força ACORDO):**
```json
{
  "processo_id": "0899999-99.2024.8.10.0002",
  "uf": "MA",
  "sub_assunto": "Golpe",
  "valor_causa": 15000.00,
  "features_documentais": {
    "tem_contrato_assinado": false,
    "tem_comprovante_ted": false,
    "laudo_favoravel": false,
    "score_fraude": 0.85,
    "indicio_de_fraude": true
  }
}
```

**Caso sem features documentais (só modelo ML):**
```json
{
  "processo_id": "1234567-89.2024.8.26.0100",
  "uf": "SP",
  "sub_assunto": "Genérico",
  "valor_causa": 8000.00,
  "features_documentais": null
}
```

---

## 5. Contrato de estabilidade

**Não vão mudar** (seguro depender em produção):
- Os nomes dos 3 campos obrigatórios: `uf`, `sub_assunto`, `valor_causa`
- Os tipos aceitos (`str`, `float`)
- A chave `features_documentais` como dict opcional

**Podem evoluir** (o motor aceita campos extras sem quebrar):
- Adição de novos campos opcionais dentro de `features_documentais` (ex: `ifp`, features granulares)
- Thresholds dos overrides (ficam em `config.py`, versionados)

---

## 6. Checklist de validação para o extrator

Antes de entregar, para cada JSON produzido:

- [ ] `uf` é string de 2 letras maiúsculas e é UF brasileira válida
- [ ] `sub_assunto ∈ {"Golpe", "Genérico"}` (exatamente, com acento)
- [ ] `valor_causa` é número (não string), positivo, sem formatação de moeda
- [ ] Se `features_documentais` existir: todas as chaves presentes têm o tipo correto
- [ ] `score_fraude`, se presente, está entre `0.0` e `1.0`
- [ ] JSON parseia sem erro (`json.load`)

---

## 7. Ponto de contato

Dúvidas sobre comportamento, campos adicionais que fariam sentido, ou edge cases que o motor não está tratando: abrir issue ou chamar o responsável pelo motor (branch `backend-motor`).
