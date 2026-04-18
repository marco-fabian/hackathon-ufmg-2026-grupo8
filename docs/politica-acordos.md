# Politica de Acordos — Banco UFMG

Explicacao da politica de decisao do motor, em linguagem do time juridico.
Material de apoio para a apresentacao final.

---

## A politica em uma frase

**"Acordar quando custa mais defender; defender quando custa mais acordar — e oferecer o que historicamente se ofereceu em casos parecidos."**

---

## A conta (3 linhas)

```
Custo esperado de defender = (chance de perder) x (condenacao se perder) + custo processual

Se Custo esperado > Limiar  ->  ACORDO  ->  Valor sugerido = alpha x Custo esperado
Senao                        ->  DEFESA
```

Tudo em reais. Tudo auditavel.

---

## De onde vem cada numero

| Numero | Origem | Exemplo |
|--------|--------|---------|
| **Chance de perder** | Modelo treinado nos 60.000 processos do banco | "32% de chance de perder" |
| **Condenacao se perder** | Modelo treinado nos 18.000 processos perdidos | "R$ 8.500, faixa R$ 5k-R$ 14k" |
| **Custo processual** | Media de honorarios + custas observada | R$ 1.408 (fixo) |
| **alpha** | 280 acordos reais ja fechados pelo banco | "0,55 = oferecer 55% do custo esperado" |
| **Limiar** | Calibrado pelo apetite de risco do banco | R$ 4.000 (default) |

**Ponto-chave:** nada e palpite. Cada parametro tem ancoragem nos proprios dados historicos do banco.

---

## Tres politicas, um motor

O banco escolhe a postura — o motor ajusta automaticamente.

| Politica | Oferta | Limiar p/ acordar | Perfil |
|----------|--------|-------------------|--------|
| **Conservadora** | Alta (percentil 75) | R$ 7.000 | "Quero fechar muitos acordos" |
| **Moderada** (default) | Mediana | R$ 4.000 | "Equilibrio" |
| **Arriscada** | Apertada (percentil 30) | R$ 2.000 | "Quero economizar mais, aceito mais defesas" |

A oferta alta = alpha maior = mais chance do autor aceitar. A oferta apertada = alpha menor = mais economia se fechar, mais recusas.

> **Nota:** "Taxa de aceite" e um proxy honesto, nao probabilidade real — a base so tem acordos fechados, nao recusados. Significa "alpha no percentil 75 historico = 75% dos acordos similares foram fechados com alpha >= esse valor".

---

## As excecoes (overrides documentais)

Quando os documentos contam uma historia muito clara, o motor sobrepoe o ML — porque seria irresponsavel ignorar evidencia forte.

| Situacao documental | Decisao forcada | Por que |
|---------------------|-----------------|---------|
| Documentacao muito forte (IFP >= 0,75) | **DEFESA** | Banco tem como provar a operacao |
| Documentacao muito fraca (IFP <= 0,30) | **ACORDO** | Sem municao para defender |
| Contrato + comprovante + laudo + sem fraude | **DEFESA** | Combinacao classica de defesa solida |
| Sem contrato + alto score de fraude | **ACORDO** | Defesa inviavel, melhor minimizar perda |

IFP = Indice de Forca Probatoria, score 0-1 que agrega presenca e qualidade dos 6 subsidios documentais (contrato, extrato, comprovante, dossie, demonstrativo, laudo).

---

## Exemplos concretos (casos reais processados pelo motor)

### Caso 01 — MA, generico, R$ 20.000 (documentacao completa)

Banco tem todos os 6 subsidios: contrato, extrato, comprovante, dossie, demonstrativo, laudo. IFP = 1,00 (FORTE).

| Variavel | Valor |
|----------|-------|
| Chance de perder (P(L)) | **5,2%** |
| Condenacao estimada se perder | R$ 7.871 (faixa R$ 5.775 - R$ 13.064) |
| Custo processual fixo | R$ 1.408 |
| **Custo esperado de defender** | **R$ 1.821** |

> **Decisao: DEFESA** (em todas as 3 politicas)
>
> Mesmo o ML ja indicava defesa (R$ 1.821 < R$ 2.000, abaixo de qualquer limiar). Mas o **override IFP_FORTE** sobrepoe a decisao por seguranca: documentacao completa = banco tem como provar a operacao.

---

### Caso 02 — AM, golpe alegado, R$ 25.000 (documentacao fraca)

Banco tem apenas 3 dos 6 subsidios. Faltam contrato, extrato e dossie. IFP = 0,42 (FRACO, zona cinzenta — nao dispara override).

| Variavel | Valor |
|----------|-------|
| Chance de perder (P(L)) | **93,0%** |
| Condenacao estimada se perder | R$ 20.601 (faixa R$ 19.933 - R$ 24.122) |
| Custo processual fixo | R$ 1.408 |
| **Custo esperado de defender** | **R$ 20.558** |

> **Decisao: ACORDO** (em todas as 3 politicas — custo supera todos os limiares)
>
> Sem override — o ML decide. O motor entao calcula o valor sugerido via alpha condicional treinado em 280 acordos similares.

| Politica | alpha | Valor sugerido | Economia vs defesa |
|----------|-------|----------------|--------------------|
| Conservadora | 0,56 | R$ 11.470 | R$ 6.816 |
| **Moderada** (default) | 0,56 | R$ 11.470 | R$ 4.544 |
| Arriscada | 0,47 | R$ 9.693 | R$ 3.260 |

> Note como o motor traduz **apetite de risco** em **valor concreto**: a Arriscada economiza R$ 1.777 a mais por acordo, em troca de menor probabilidade do autor aceitar.

---

## O que o slide deve transmitir

1. **Decisao financeira, nao juridica abstrata** — o banco quer minimizar custo total, e o motor calcula isso explicitamente.
2. **Auditavel** — cada numero tem origem rastreavel.
3. **Politica e parametro, nao chute** — o banco escolhe o apetite, o motor traduz.
4. **Documentos forte/fraco tem voz** — overrides garantem que o ML nao passe por cima de evidencia clara.

---

## Apoio tecnico (se questionado)

- **Acuracia do modelo de chance de perder:** AUC-ROC 0,919 (de cada 100 pares, em 92 o modelo ranqueia o "vai perder" acima do "vai ganhar").
- **Calibracao:** ECE 0,026. Quando o modelo diz "70% de chance de perder", na pratica perde em ~70% dos casos.
- **Acuracia da condenacao estimada:** MAE R$ 2.449 sobre media real R$ 10.616 (~23% de erro).
- **Faixa de condenacao (IC 80%):** cobertura empirica 73,4% (alvo 80%) — conservadora.
- **alpha condicional:** treinado em 280 acordos reais por quantile regression. Distribuicao: media 0,609, mediana 0,542.

Detalhes em [modelo.md](modelo.md).