"""Geracao de explicacoes em linguagem natural para o advogado.

Dois modos:
  - Deterministico (sempre disponivel): usa o texto pronto de ResultadoDecisao.
  - LLM (se OPENAI_API_KEY no ambiente): envia o contexto estruturado para
    o modelo e recebe um paragrafo juridico formal. Fallback silencioso
    para o deterministico em erro ou timeout.

SHAP: funcao `explicar_shap` expoe contribuicao de cada feature em P(L) e Vc
como top-K lista com sinal (positivo aumenta P(L), negativo diminui).
"""
from __future__ import annotations

import json
import os
from typing import Optional

import numpy as np
import pandas as pd

from . import config as cfg

try:
    import shap  # noqa: F401
    _SHAP_OK = True
except ImportError:
    _SHAP_OK = False

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


def explicar_shap(
    motor,
    uf: str,
    sub_assunto: str,
    valor_causa: float,
    features_documentais: dict | None = None,
    top_k: int = 3,
) -> dict:
    """Retorna contribuicoes SHAP para P(L) e Vc num processo especifico."""
    if not _SHAP_OK:
        return {"disponivel": False, "motivo": "pacote shap nao instalado"}

    import shap

    X = _montar_features(motor, uf, sub_assunto, valor_causa, features_documentais)
    nomes = list(X.columns)

    # Media dos SHAP values sobre os 5 calibrated_classifiers_ (CalibratedClassifierCV cv=5).
    # Pegar so o [0] seria explicar 1/5 do modelo real.
    shap_a_list = []
    for cc in motor.modelo_a.calibrated_classifiers_:
        explainer = shap.TreeExplainer(cc.estimator)
        s = explainer.shap_values(X)
        if isinstance(s, list):
            s = s[1]
        shap_a_list.append(s[0])
    shap_a_mean = np.mean(shap_a_list, axis=0)
    top_a = _top_contributions(nomes, shap_a_mean, top_k)

    explainer_b = shap.TreeExplainer(motor.modelo_b)
    shap_b = explainer_b.shap_values(X)
    top_b = _top_contributions(nomes, shap_b[0], top_k)

    return {
        "disponivel": True,
        "top_features_p_l": top_a,
        "top_features_vc": top_b,
    }


def _top_contributions(nomes: list[str], valores: np.ndarray, k: int) -> list[dict]:
    idx = np.argsort(np.abs(valores))[::-1][:k]
    return [
        {"feature": nomes[i], "contribuicao": float(valores[i])}
        for i in idx
    ]


def _montar_features(
    motor,
    uf: str,
    sub_assunto: str,
    valor_causa: float,
    features_documentais: dict | None = None,
) -> pd.DataFrame:
    from . import features as feat

    subsidios = None
    if features_documentais:
        subsidios = {
            k: bool(features_documentais.get(k, False))
            for k in cfg.FEATURES_BOOLEANAS
        }

    return feat.build_features_single(
        uf=uf,
        sub_assunto=sub_assunto,
        valor_causa=valor_causa,
        encoder=motor.encoder,
        stats=motor.stats,
        valor_causa_bins=motor.valor_causa_bins,
        subsidios=subsidios,
    )


def gerar_explicacao_llm(
    resultado,
    shap_info: Optional[dict] = None,
    model: str = "gpt-4o-mini",
    timeout: float = 8.0,
) -> Optional[str]:
    """Envia contexto para OpenAI e retorna paragrafo juridico. None em falha."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        from openai import OpenAI
    except ImportError:
        return None

    contexto = {
        "decisao": resultado.decisao.value,
        "probabilidade_perda": round(resultado.probabilidade_perda, 4),
        "valor_condenacao_estimado": round(resultado.valor_condenacao_estimado, 2),
        "faixa_IC80": [round(x, 2) for x in resultado.valor_condenacao_faixa],
        "custo_esperado_defesa": round(resultado.custo_esperado_defesa, 2),
        "limiar_aplicado": resultado.limiar_aplicado,
        "valor_acordo_sugerido": (
            round(resultado.valor_acordo_sugerido, 2)
            if resultado.valor_acordo_sugerido is not None
            else None
        ),
        "alpha_aplicado": resultado.alpha_aplicado,
        "politica": resultado.policy,
        "override_aplicado": resultado.override_aplicado,
        "razao_override": resultado.razao_override.value,
        "features": resultado.features_entrada,
        "shap": shap_info,
    }

    system_msg = (
        "Voce e um assistente juridico que explica recomendacoes de decisao "
        "(acordo ou defesa) em processos civeis de nao reconhecimento de emprestimo "
        "para advogados externos. Seja objetivo e tecnico, em portugues do Brasil. "
        "Nao invente numeros. Use APENAS os dados fornecidos no JSON. "
        "Formato: um unico paragrafo de ate 120 palavras, sem listas e sem cabecalhos."
    )
    user_msg = (
        "Gere a recomendacao juridica em um paragrafo, citando P(L), Vc, faixa, "
        "custo esperado e (se acordo) valor sugerido. Se houver override documental, "
        "justifique a sobreposicao da decisao do modelo.\n\n"
        f"DADOS:\n```json\n{json.dumps(contexto, ensure_ascii=False, indent=2)}\n```"
    )

    try:
        client = OpenAI(api_key=api_key, timeout=timeout)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=400,
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:  # noqa: BLE001
        print(f"[explicador] LLM falhou ({type(exc).__name__}), usando fallback.")
        return None


def gerar_explicacao(resultado, shap_info: Optional[dict] = None, usar_llm: bool = True) -> str:
    """Entrypoint principal: LLM se possivel, senao deterministico."""
    if usar_llm:
        texto = gerar_explicacao_llm(resultado, shap_info=shap_info)
        if texto:
            return texto
    return resultado.explicacao


if __name__ == "__main__":
    from .motor_decisao import MotorDecisao

    motor = MotorDecisao.carregar()
    casos = [
        ("SP", "Golpe", 25000.0, None),
        (
            "SP",
            "Golpe",
            15000.0,
            {
                "tem_contrato_assinado": True,
                "tem_comprovante_ted": True,
                "laudo_favoravel": True,
                "score_fraude": 0.15,
            },
        ),
    ]
    for uf, sub, valor, fd in casos:
        r = motor.decidir(uf, sub, valor, features_documentais=fd)
        shap_info = explicar_shap(motor, uf, sub, valor, features_documentais=fd)
        texto = gerar_explicacao(r, shap_info=shap_info)
        print(f"\n=== {uf} | {sub} | R$ {valor:,.0f} ===")
        print(f"Decisao: {r.decisao.value}")
        print(f"SHAP disponivel: {shap_info.get('disponivel')}")
        if shap_info.get("disponivel"):
            print("Top P(L):", shap_info["top_features_p_l"])
            print("Top Vc :", shap_info["top_features_vc"])
        print("\nExplicacao:\n" + texto)
