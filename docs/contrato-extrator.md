# Contrato do Extrator → Motor de Decisão

Especificação dos campos que o extrator de PDFs precisa produzir para que o motor de decisão jurídica (`src/backend/modelo/motor_decisao.py`) funcione num caso real.

> Este documento é o contrato **input-only** do motor. Para a lógica interna (ML, overrides, políticas), ver [`CLAUDE.md`](../CLAUDE.md).

---

## TL;DR

O motor consome **um JSON por processo** com 3 campos obrigatórios dos Autos e 10 campos documentais (6 obrigatórios para o modelo + 4 opcionais para overrides).

```json
{
  "processo_id": "0801234-56.2024.8.10.0001",
  "uf": "MA",
  "sub_assunto": "Golpe",
  "valor_causa": 30000.00,
  "features_documentais": {
    "tem_contrato": true,
    "tem_extrato": true,
    "tem_comprovante": true,
    "tem_dossie": true,
    "tem_demonstrativo": true,
    "tem_laudo": true,
    "ifp": 0.82,
    "score_fraude": 0.12,
    "laudo_favoravel": true,
    "indicio_de_fraude": false
  }
}
```

Uso:

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

## 1. Campos obrigatórios (dos Autos)

Vêm do **`01_Autos_Processo_*.pdf`** (petição inicial / autuação). Se algum faltar, o motor **falha**.

| # | Campo | Tipo | Formato aceito | Origem no PDF |
|---|---|---|---|---|
| 1 | `uf` | `str` | Sigla de 2 letras maiúsculas (`"SP"`, `"MA"`, `"MG"`...) | Número CNJ do processo: dígitos após `8.` identificam o tribunal (`8.10.` = TJ-MA, `8.26.` = TJ-SP, etc.) |
| 2 | `sub_assunto` | `str` | Exatamente `"Golpe"` ou `"Genérico"` (com acento) | Campo "Assunto" da autuação. Se o texto da inicial mencionar "golpe", "fraude", "estelionato", "não reconhece a contratação" → `"Golpe"`; caso contrário → `"Genérico"` |
| 3 | `valor_causa` | `float` | Em R$, sem formatação (`30000.00`, não `"R$ 30.000,00"`) | Campo "Valor da causa" na petição inicial |

**Edge cases:**
- UF fora das 27 brasileiras → o modelo trata como desconhecida (degrada graciosamente, mas preferível evitar)
- `sub_assunto` fora de `{"Golpe", "Genérico"}` → idem
- `valor_causa` zero ou negativo → erro; validar no extrator

---

## 2. Campos documentais (`features_documentais`)

Vêm da análise dos demais PDFs (Contrato, Extrato, Comprovante BACEN, Dossiê, Demonstrativo, Laudo). Passados num sub-dicionário `features_documentais`.

### 2.1. Os 6 booleanos de presença (features do modelo)

Estes 6 são **features de treino do modelo ML** — estão em todas as 60k linhas da base. O modelo aprende diretamente que "banco sem contrato = alta chance de perder". Default se ausente: `false` (subsídio não foi fornecido, alinhado com a base).

| # | Campo | Tipo | O que significa | Como derivar dos PDFs |
|---|---|---|---|---|
| 4 | `tem_contrato` | `bool` | Existe o contrato do empréstimo | `true` se `02_Contrato_*.pdf` está presente e contém contrato válido |
| 5 | `tem_extrato` | `bool` | Existe extrato bancário do autor | `true` se `03_Extrato_*.pdf` está presente |
| 6 | `tem_comprovante` | `bool` | Existe comprovante de crédito BACEN | `true` se `04_Comprovante_*.pdf` está presente |
| 7 | `tem_dossie` | `bool` | Existe dossiê grafotécnico (Veritas) | `true` se `05_Dossie_*.pdf` está presente |
| 8 | `tem_demonstrativo` | `bool` | Existe demonstrativo de evolução da dívida | `true` se `06_Demonstrativo_*.pdf` está presente |
| 9 | `tem_laudo` | `bool` | Existe laudo referenciado (evidências digitais) | `true` se `07_Laudo_*.pdf` está presente |

**Regra semântica crítica:** só reporte `false` se o documento realmente **não existe** no processo. Se o documento existe mas você falhou em processá-lo (PDF corrompido, OCR ilegível), **reporte `null`** em vez de `false` — são sinais diferentes. XGBoost trata `null` como missing nativamente; `false` significa "não foi fornecido" (um fato jurídico).

### 2.2. Os 4 opcionais (extras para overrides)

Sinais semânticos que vão além de presença. Usados só pelas regras de override — não entram no modelo ML.

| # | Campo | Tipo | Faixa | Como derivar |
|---|---|---|---|---|
| 10 | `ifp` | `float` | `[0.0, 1.0]` | Score IFP global (0=documentação fraca, 1=forte). Divida o `ifp.score` v2 por 100 |
| 11 | `score_fraude` | `float` | `[0.0, 1.0]` | 0=nenhum sinal de fraude; 1=fraude confirmada. Se não conseguir calcular, omita ou passe `0.5` |
| 12 | `laudo_favoravel` | `bool` | — | `true` se o laudo tem qualquer evidência digital pró-banco (biometria, device fingerprint, geolocalização, gravação de voz) |
| 13 | `indicio_de_fraude` | `bool` | — | `true` se dossiê diz que assinatura não confere **ou** extrato tem destinatários suspeitos |

---

## 3. Regras de override (disparam antes do ML)

Quando `features_documentais` é fornecido, o motor aplica **overrides determinísticos**:

| Prioridade | Condição | Decisão | Razão |
|---|---|---|---|
| 1 | `ifp >= 0.75` | `DEFESA` | `IFP_FORTE` |
| 1 | `ifp <= 0.50` | `ACORDO` | `IFP_FRACO` |
| 2 | `tem_contrato` **E** `tem_comprovante` **E** `laudo_favoravel` **E** `score_fraude < 0.30` | `DEFESA` | `DOCUMENTACAO_COMPLETA_SEM_FRAUDE` |
| 3 | `score_fraude > 0.70` **E** `NOT tem_contrato` | `ACORDO` | `FRAUDE_CONFIRMADA_SEM_CONTRATO` |
| — | Nenhuma das acima | — | Modelo ML decide |

Thresholds em [`src/backend/modelo/config.py`](../src/backend/modelo/config.py).

---

## 4. Formato de entrega sugerido

**Um arquivo JSON por processo**, nomeado com o ID do processo:

```
extraction_output/
├── 0801234-56.2024.8.10.0001.json
├── 0899999-99.2024.8.10.0002.json
└── ...
```

### Exemplos

**Caso forte (força DEFESA via IFP):**
```json
{
  "processo_id": "0801234-56.2024.8.10.0001",
  "uf": "MA",
  "sub_assunto": "Golpe",
  "valor_causa": 30000.00,
  "features_documentais": {
    "tem_contrato": true,
    "tem_extrato": true,
    "tem_comprovante": true,
    "tem_dossie": true,
    "tem_demonstrativo": true,
    "tem_laudo": true,
    "ifp": 1.00,
    "score_fraude": 0.10,
    "laudo_favoravel": true,
    "indicio_de_fraude": false
  }
}
```

**Caso fraco (força ACORDO via IFP):**
```json
{
  "processo_id": "0899999-99.2024.8.10.0002",
  "uf": "MA",
  "sub_assunto": "Golpe",
  "valor_causa": 15000.00,
  "features_documentais": {
    "tem_contrato": false,
    "tem_extrato": false,
    "tem_comprovante": true,
    "tem_dossie": false,
    "tem_demonstrativo": true,
    "tem_laudo": true,
    "ifp": 0.42,
    "score_fraude": 0.58,
    "laudo_favoravel": false,
    "indicio_de_fraude": false
  }
}
```

**Caso sem features documentais (só modelo ML, sem overrides):**
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
- Os 3 obrigatórios: `uf`, `sub_assunto`, `valor_causa`
- Os 6 booleanos de presença: `tem_contrato`, `tem_extrato`, `tem_comprovante`, `tem_dossie`, `tem_demonstrativo`, `tem_laudo`
- A estrutura `features_documentais` como dict opcional

**Podem evoluir:**
- Os 4 campos de override (`ifp`, `score_fraude`, `laudo_favoravel`, `indicio_de_fraude`) — podem ser renomeados ou substituídos
- Thresholds dos overrides (em `config.py`)

---

## 6. Checklist de validação para o extrator

Antes de entregar, para cada JSON produzido:

- [ ] `uf` é string de 2 letras maiúsculas e é UF brasileira válida
- [ ] `sub_assunto ∈ {"Golpe", "Genérico"}` (exatamente, com acento)
- [ ] `valor_causa` é número (não string), positivo, sem formatação de moeda
- [ ] Os 6 `tem_*` são `bool` (não `int`, não `null` exceto se PDF falhou em processar)
- [ ] `ifp`, se presente, está entre `0.0` e `1.0` (normalizado do `score` do IFP v2)
- [ ] `score_fraude`, se presente, está entre `0.0` e `1.0`
- [ ] JSON parseia sem erro (`json.load`)

---

## 7. Ponto de contato

Dúvidas sobre comportamento, campos adicionais que fariam sentido, ou edge cases que o motor não está tratando: abrir issue ou chamar o responsável pelo motor (branch `backend-motor`).
