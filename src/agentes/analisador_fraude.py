"""Agente de análise de fraude.

Recebe as features já extraídas (Autos + subsídios do IFP) e produz um
score_fraude calibrado [0.0, 1.0] com justificativa. Diferente dos extractors
deterministicos (um PDF -> schema), este agente pondera sinais cross-documento.

Interpretação do score (tabela do contrato-extrator.md):
- 0.0-0.3: fraude improvável (docs consistentes, autor movimentou dinheiro, etc)
- 0.3-0.7: zona cinza (alguns sinais conflitantes)
- 0.7-1.0: fraude provável (divergências claras, inconsistências)

Thresholds dos overrides em src/backend/modelo/config.py:
- score_fraude < 0.30 + docs completos -> DEFESA forçada
- score_fraude > 0.70 + sem contrato   -> ACORDO forçado
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from extractors.base import extract_with_schema


SYSTEM = """Você é um perito em detecção de fraude em operações de crédito
consignado no Brasil. Seu trabalho é produzir um score_fraude calibrado entre
0.0 e 1.0 a partir do contexto fornecido.

Calibração obrigatória:
- 0.00-0.30: cenário consistente com operação legítima (contrato assinado,
  crédito entrou e foi movimentado pelo autor, parcelas pagas, dossiê
  grafotécnico válido, laudo com evidências digitais).
- 0.30-0.70: sinais conflitantes (ex: autor pagou algumas parcelas mas
  alega golpe, documentação parcial, canal digital sem biometria
  suficiente).
- 0.70-1.00: evidência de fraude (assinatura diverge, destinatários
  suspeitos no extrato, crédito em conta de outro banco, BO registrado,
  alegação de phishing/clonagem corroborada).

Sinais PROTETIVOS (puxam score para BAIXO):
- Extrato mostra que o autor movimentou o dinheiro recebido (TED/PIX/saque)
- Demonstrativo indica parcelas pagas (>=3) antes do questionamento
- Dossiê grafotécnico confirma assinatura
- Laudo tem biometria facial / device fingerprint / geolocalização / gravação

Sinais de FRAUDE (puxam score para CIMA):
- Falta de contrato OU extrato
- Assinatura NÃO confere no dossiê
- Destinatários suspeitos (PIX para terceiro imediatamente)
- Canal digital SEM biometria ou device fingerprint
- Alegação específica de golpe/clonagem/phishing
- Crédito depositado em conta de outro banco
- Autor declara não possuir conta no banco réu

Produza SEMPRE:
- score_fraude: float entre 0.0 e 1.0 (3 casas decimais)
- indicadores_fraude: lista de até 6 sinais de fraude identificados (em PT-BR, curto)
- sinais_protetivos: lista de até 6 sinais de legitimidade
- justificativa: 1-3 frases explicando o score
"""


class AnaliseFraude(BaseModel):
    score_fraude: float = Field(..., ge=0.0, le=1.0, description="Score [0, 1]")
    indicadores_fraude: list[str] = Field(default_factory=list, max_length=6)
    sinais_protetivos: list[str] = Field(default_factory=list, max_length=6)
    justificativa: str = Field(..., description="1-3 frases explicando o score")


def _resumir_contexto(autos: dict[str, Any], ifp: dict[str, Any]) -> str:
    """Monta um resumo textual do caso para o LLM, evitando enviar o JSON cru."""
    linhas: list[str] = []
    linhas.append("## Petição inicial (Autos)")
    linhas.append(f"- UF: {autos.get('uf')}")
    linhas.append(f"- Sub-assunto: {autos.get('sub_assunto')}")
    linhas.append(f"- Valor da causa: R$ {autos.get('valor_causa')}")

    linhas.append("\n## IFP (subsídios do banco)")
    linhas.append(f"- Score: {ifp.get('ifp', {}).get('score')}/100 "
                  f"({ifp.get('ifp', {}).get('tier')})")

    for doc, info in (ifp.get("subsidios") or {}).items():
        presente = info.get("presente")
        if not presente:
            linhas.append(f"- {doc}: AUSENTE")
            continue
        feats = info.get("features") or {}
        resumo = _resumo_doc(doc, feats)
        linhas.append(f"- {doc}: {resumo}")

    sinais = ifp.get("sinais_fortes") or []
    if sinais:
        linhas.append("\n## Sinais fortes já identificados")
        for s in sinais:
            linhas.append(f"- {s}")

    return "\n".join(linhas)


def _resumo_doc(tipo: str, feats: dict[str, Any]) -> str:
    if tipo == "contrato":
        return (f"assinatura={feats.get('assinatura_tomador_presente')}, "
                f"canal={feats.get('canal_contratacao')}, "
                f"valor={feats.get('valor_liberado')}")
    if tipo == "extrato":
        return (f"credito_aparece={feats.get('credito_emprestimo_aparece')}, "
                f"autor_movimentou={feats.get('autor_movimentou_dinheiro')}, "
                f"tipos={feats.get('tipos_movimentacao')}, "
                f"suspeitos={feats.get('destinatarios_suspeitos')}")
    if tipo == "comprovante":
        return (f"canal={feats.get('canal_contratacao')}, "
                f"instituicao_depositaria={feats.get('instituicao_depositaria')}")
    if tipo == "demonstrativo":
        return (f"parcelas_pagas={feats.get('qtd_parcelas_pagas')}/"
                f"{feats.get('qtd_parcelas_total')}")
    if tipo == "dossie":
        return (f"assinatura_confere={feats.get('assinatura_confere')}, "
                f"liveness={feats.get('liveness_aprovada')}, "
                f"score={feats.get('score_confianca')}")
    if tipo == "laudo":
        return (f"canal={feats.get('canal_contratacao')}, "
                f"biometria={feats.get('tem_biometria_facial')}, "
                f"device_fp={feats.get('tem_device_fingerprint')}, "
                f"geo={feats.get('tem_geolocalizacao')}, "
                f"gravacao={feats.get('tem_gravacao_voz')}")
    return json.dumps(feats, ensure_ascii=False)


def analisar_fraude(autos: dict[str, Any], ifp: dict[str, Any]) -> AnaliseFraude:
    """Chama o LLM para calibrar o score_fraude com base no contexto.

    autos: dict AutosFeatures.model_dump() (uf, sub_assunto, valor_causa)
    ifp:   dict resultado de compute_ifp_v2
    """
    contexto = _resumir_contexto(autos, ifp)
    return extract_with_schema(SYSTEM, contexto, AnaliseFraude)
