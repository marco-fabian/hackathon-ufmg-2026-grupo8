"""Constantes tecnicas do motor de decisao.

Contem APENAS configuracoes tecnicas (paths, random state, hiperparametros
iniciais do XGBoost, grids para backtesting). Nada aqui e valor de negocio
"calibravel" - alpha, Limiar, Cp e a politica default sao derivados dos
dados durante o treino e salvos em modelos_treinados/parametros_otimizados.json.
"""
from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = PROJECT_ROOT / "data" / "Hackaton_Enter_Base_Candidatos.xlsx"
MODELS_DIR = Path(__file__).resolve().parent / "modelos_treinados"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

RANDOM_STATE = 42
TEST_SIZE = 0.20
CV_FOLDS = 5

COL_UF = "UF"
COL_SUB_ASSUNTO = "Sub-assunto"
COL_VALOR_CAUSA = "Valor da causa"
COL_VALOR_CONDENACAO = "Valor da condenação/indenização"
COL_RESULTADO_MACRO = "Resultado macro"
COL_NUM_PROCESSO = "Número do processo"
VAL_PERDA = "Não Êxito"

SHEET_RESULTADOS = "Resultados dos processos"
SHEET_SUBSIDIOS = "Subsídios disponibilizados"

SUBSIDIOS_COL_MAP = {
    "Contrato": "tem_contrato",
    "Extrato": "tem_extrato",
    "Comprovante de crédito": "tem_comprovante",
    "Dossiê": "tem_dossie",
    "Demonstrativo de evolução da dívida": "tem_demonstrativo",
    "Laudo referenciado": "tem_laudo",
}

FEATURES_CATEGORICAS = [COL_UF, COL_SUB_ASSUNTO]
FEATURES_NUMERICAS_BASE = [COL_VALOR_CAUSA]
FEATURES_BOOLEANAS = list(SUBSIDIOS_COL_MAP.values())

XGB_CLASSIFIER_PARAMS = {
    "n_estimators": 300,
    "max_depth": 6,
    "learning_rate": 0.1,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "eval_metric": "logloss",
    "random_state": RANDOM_STATE,
    "n_jobs": -1,
}

XGB_REGRESSOR_PARAMS = {
    "n_estimators": 400,
    "max_depth": 6,
    "learning_rate": 0.08,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "random_state": RANDOM_STATE,
    "n_jobs": -1,
}

XGB_QUANTILE_PARAMS = {
    "n_estimators": 400,
    "max_depth": 6,
    "learning_rate": 0.08,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "objective": "reg:quantileerror",
    "random_state": RANDOM_STATE,
    "n_jobs": -1,
}
QUANTIS = (0.10, 0.50, 0.90)

ALPHAS_GRID = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]
LIMIARES_GRID = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7000, 8000]

POLICIES_ALVO = {
    "Conservadora": 0.10,
    "Moderada": 0.25,
    "Balanceada": 0.35,
    "Agressiva": 0.60,
    "Maxima": 1.00,
}
POLICY_DEFAULT = "Balanceada"

CP_FATOR_MEDIANA = 0.14

OVERRIDE_SCORE_FRAUDE_BAIXO = 0.30
OVERRIDE_SCORE_FRAUDE_ALTO = 0.70

OVERRIDE_IFP_ALTO = 0.75
OVERRIDE_IFP_BAIXO = 0.50

TARGET_ENCODING_SMOOTHING = 10.0

BANCO_TREINO_CSV_PATH = PROJECT_ROOT / "data" / "banco_treino.csv"

MODEL_A_PATH = MODELS_DIR / "modelo_probabilidade_perda.joblib"
MODEL_B_PATH = MODELS_DIR / "modelo_estimativa_condenacao.joblib"
MODEL_B_QUANTIS_PATH = MODELS_DIR / "modelo_quantis_condenacao.joblib"
ENCODER_PATH = MODELS_DIR / "encoder_features.joblib"
TARGET_ENC_STATS_PATH = MODELS_DIR / "target_encoding_stats.joblib"
METRICS_A_PATH = MODELS_DIR / "metricas_classificacao.json"
METRICS_B_PATH = MODELS_DIR / "metricas_regressao.json"
METRICS_B_QUANTIS_PATH = MODELS_DIR / "metricas_quantis.json"
PARAMS_OTIMIZADOS_PATH = MODELS_DIR / "parametros_otimizados.json"
BACKTESTING_CSV_PATH = MODELS_DIR / "backtesting.csv"
REPORT_POLICIES_PATH = MODELS_DIR / "report_politicas.md"
RELIABILITY_DIAGRAM_PATH = MODELS_DIR / "reliability_diagram.png"
REGRESSAO_SCATTER_PATH = MODELS_DIR / "regressao_real_vs_previsto.png"
BACKTESTING_PLOT_PATH = MODELS_DIR / "backtesting_economia_vs_acordos.png"
