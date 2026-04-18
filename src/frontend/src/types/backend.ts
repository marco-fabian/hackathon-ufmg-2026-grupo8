export interface Politica {
  nome: string
  alpha: number
  limiar: number
  taxa_acordo_pct: number
  economia_total: number
  economia_pct: number
  economia_por_processo: number
  custo_total: number
  baseline: number
  default: boolean
}

export interface ShapFeature {
  feature: string
  contribuicao: number
}

export interface ShapInfo {
  disponivel: boolean
  motivo?: string
  top_features_p_l?: ShapFeature[]
  top_features_vc?: ShapFeature[]
}

export interface Metricas {
  modelo_a: {
    auc_roc: number
    brier_score: number
    ece: number
    cv_auc_mean: number
    cv_auc_std: number
    taxa_perda_real: number
    taxa_perda_prevista: number
    n_test: number
  }
  modelo_b: {
    mae: number
    r2: number
    mape: number
    media_real: number
    n_test: number
  }
  quantis: {
    cobertura_ic80: number
    pinball_q10: number
    pinball_q50: number
    pinball_q90: number
  }
}

export interface ResultadoDecisao {
  decisao: 'ACORDO' | 'DEFESA'
  probabilidade_perda: number
  valor_condenacao_estimado: number
  valor_condenacao_faixa: [number, number]
  custo_esperado_defesa: number
  valor_acordo_sugerido: number | null
  override_aplicado: boolean
  razao_override: string
  policy: string
  explicacao: string
  shap?: ShapInfo
}

export interface CasoResumo {
  slug: string
  processo_id: string
  uf: string
  sub_assunto: string
  valor_causa: number
  decisao: 'ACORDO' | 'DEFESA'
  probabilidade_perda: number
  valor_acordo_sugerido: number | null
  valor_condenacao_faixa: [number, number]
  explicacao: string
}

export interface PipelineCaso {
  processo_id: string
  payload: {
    uf: string
    sub_assunto: string
    valor_causa: number
    features_documentais: Record<string, unknown>
  }
  analise_fraude: Record<string, unknown>
  ifp: Record<string, unknown>
  decisao: {
    decisao: 'ACORDO' | 'DEFESA'
    probabilidade_perda: number
    valor_condenacao_estimado: number
    valor_condenacao_faixa: [number, number]
    custo_esperado_defesa: number
    valor_acordo_sugerido: number | null
    override_aplicado: boolean
    razao_override: string
    policy: string
    explicacao: string
  }
}
