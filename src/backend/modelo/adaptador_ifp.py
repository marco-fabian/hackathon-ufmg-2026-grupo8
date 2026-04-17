"""Tradutor entre o output do IFP (compute_ifp_v2) e o contrato
`features_documentais` esperado pelo motor de decisao.

O IFP extrai 6 subsidios dos PDFs e devolve um JSON rico (schema em
docs/schemas/ifp.json). O motor, historicamente, espera um dict plano com
5 flags + score. Este adaptador e a ponte entre os dois, mantendo o motor
estavel enquanto o extrator evolui.

Campos do IFP que NAO sao cobertos aqui (precisam de outro extrator):
  - uf, sub_assunto, valor_causa  <- ficam na peticao inicial (01_Autos)

Uso:
    from ifp_v2 import compute_ifp_v2
    from src.backend.modelo.adaptador_ifp import ifp_to_features_doc
    from src.backend.modelo.motor_decisao import MotorDecisao

    resultado_ifp = compute_ifp_v2(pasta_processo=Path("data/Caso_01"))
    features_doc = ifp_to_features_doc(resultado_ifp)

    motor = MotorDecisao.carregar()
    r = motor.decidir(
        uf="MA", sub_assunto="Golpe", valor_causa=30000.0,
        features_documentais=features_doc,
    )
"""
from __future__ import annotations

from typing import Any


def ifp_to_features_doc(resultado_ifp: dict) -> dict:
    """Converte o dict retornado por compute_ifp_v2 no contrato do motor."""
    ifp = resultado_ifp.get("ifp") or {}
    subs = resultado_ifp.get("subsidios") or {}

    contrato_feat = _features(subs, "contrato")
    extrato_feat = _features(subs, "extrato")
    comprovante_feat = _features(subs, "comprovante")
    dossie_feat = _features(subs, "dossie")
    laudo_feat = _features(subs, "laudo")

    ifp_score = float(ifp.get("score", 50)) / 100.0

    tem_contrato_assinado = bool(
        _presente(subs, "contrato")
        and contrato_feat.get("assinatura_tomador_presente", False)
    )

    tipos_mov = extrato_feat.get("tipos_movimentacao") or []
    tem_comprovante_ted = bool(
        _presente(subs, "comprovante") or "TED" in tipos_mov
    )

    laudo_favoravel = bool(
        _presente(subs, "laudo")
        and any(
            laudo_feat.get(flag, False)
            for flag in (
                "tem_biometria_facial",
                "tem_device_fingerprint",
                "tem_geolocalizacao",
                "tem_gravacao_voz",
            )
        )
    )

    assinatura_nao_confere = (
        _presente(subs, "dossie")
        and dossie_feat.get("assinatura_confere") is False
    )
    destinatarios_suspeitos = bool(extrato_feat.get("destinatarios_suspeitos", False))
    indicio_de_fraude = assinatura_nao_confere or destinatarios_suspeitos

    score_fraude = _derivar_score_fraude(
        ifp_score=ifp_score,
        indicio_de_fraude=indicio_de_fraude,
        tem_contrato_assinado=tem_contrato_assinado,
        tem_comprovante_ted=tem_comprovante_ted,
    )

    return {
        "ifp": ifp_score,
        "tem_contrato_assinado": tem_contrato_assinado,
        "tem_comprovante_ted": tem_comprovante_ted,
        "laudo_favoravel": laudo_favoravel,
        "score_fraude": score_fraude,
        "indicio_de_fraude": indicio_de_fraude,
    }


def _presente(subs: dict, chave: str) -> bool:
    item = subs.get(chave) or {}
    return bool(item.get("presente", False))


def _features(subs: dict, chave: str) -> dict[str, Any]:
    item = subs.get(chave) or {}
    return item.get("features") or {}


def _derivar_score_fraude(
    *,
    ifp_score: float,
    indicio_de_fraude: bool,
    tem_contrato_assinado: bool,
    tem_comprovante_ted: bool,
) -> float:
    """O IFP nao fornece score_fraude direto. Derivamos de sinais do JSON.

    - assinatura nao confere ou destinatarios suspeitos -> fraude alta (0.85)
    - documentacao completa + IFP alto                  -> fraude baixa (0.10)
    - caso intermediario                                -> 1 - IFP (proxy inverso)
    """
    if indicio_de_fraude:
        return 0.85
    if tem_contrato_assinado and tem_comprovante_ted and ifp_score >= 0.70:
        return 0.10
    return round(1.0 - ifp_score, 3)
