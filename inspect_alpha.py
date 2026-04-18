"""Calcula alpha empirico para os 280 acordos reais da base."""
import json
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, ".")
from src.backend.modelo import config as cfg
from src.backend.modelo import features as feat
sys.modules["__main__"].TargetEncodingStats = feat.TargetEncodingStats

import joblib

modelo_a = joblib.load(cfg.MODEL_A_PATH)
modelo_b = joblib.load(cfg.MODEL_B_PATH)
encoder, stats, bins = feat.carregar_artefatos_features()
with open(cfg.PARAMS_OTIMIZADOS_PATH) as f:
    params = json.load(f)
cp = params["cp"]
print(f"Cp = R$ {cp:,.2f}")

df = pd.read_csv("data/banco_treino.csv")
acordos = df[df["Resultado micro"] == "Acordo"].copy().reset_index(drop=True)
print(f"Acordos na base: {len(acordos)}")

feature_cols = [
    cfg.COL_UF, cfg.COL_SUB_ASSUNTO, cfg.COL_VALOR_CAUSA,
    "log_valor_causa", "valor_causa_bin",
    "uf_taxa_perda_hist", "uf_ticket_medio_cond",
    *cfg.FEATURES_BOOLEANAS, "qtd_docs",
]
rows = []
for _, r in acordos.iterrows():
    X = feat.build_features_single(
        uf=r[cfg.COL_UF],
        sub_assunto=r[cfg.COL_SUB_ASSUNTO],
        valor_causa=r[cfg.COL_VALOR_CAUSA],
        encoder=encoder, stats=stats, valor_causa_bins=bins,
        subsidios={c: bool(r[c]) for c in cfg.FEATURES_BOOLEANAS},
    )
    rows.append(X)
X_acordos = pd.concat(rows, ignore_index=True)

p_l = modelo_a.predict_proba(X_acordos)[:, 1]
vc_pred = np.clip(np.expm1(modelo_b.predict(X_acordos)), 0, None)
e_c_defesa = p_l * vc_pred + cp
v_acordo_real = acordos["Valor da condenação/indenização"].values
alpha_empirico = v_acordo_real / e_c_defesa

acordos["p_l_pred"] = p_l
acordos["vc_pred"] = vc_pred
acordos["e_c_defesa"] = e_c_defesa
acordos["v_acordo_real"] = v_acordo_real
acordos["alpha_empirico"] = alpha_empirico

print(f"\nDistribuicao de alpha empirico (V_acordo / E[C_defesa]):")
print(pd.Series(alpha_empirico).describe())
qs = [0.10, 0.25, 0.50, 0.75, 0.90]
print(f"\nQuantis:")
for q in qs:
    print(f"  {int(q*100)}%: alpha = {np.quantile(alpha_empirico, q):.3f}")

print(f"\n5 amostras:")
print(acordos[[cfg.COL_UF, cfg.COL_VALOR_CAUSA, "p_l_pred", "vc_pred", "e_c_defesa", "v_acordo_real", "alpha_empirico"]].head().to_string(index=False))

# proposta de alphas por politica (conservadora paga mais p fechar, maxima aperta)
print(f"\n\nProposta de alphas por politica (mapeando quantis):")
politicas_quantis = [
    ("Conservadora", 0.90),
    ("Moderada",     0.75),
    ("Balanceada",   0.50),
    ("Agressiva",    0.25),
    ("Maxima",       0.10),
]
for nome, q in politicas_quantis:
    a = float(np.quantile(alpha_empirico, q))
    print(f"  {nome:<14} (quantil {int(q*100)}%) -> alpha = {a:.3f}")
