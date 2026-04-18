import { api } from './api'
import type { CasoResumo, Metricas, PipelineCaso, Politica, ProcessoFinalizado, ResultadoDecisao } from '@/types/backend'

export async function listarCasos(): Promise<CasoResumo[]> {
  const res = await api.get<CasoResumo[]>('/casos')
  return res.data
}

export async function obterCaso(slug: string): Promise<PipelineCaso> {
  const res = await api.get<PipelineCaso>(`/casos/${slug}`)
  return res.data
}

export async function listarPoliticas(): Promise<Politica[]> {
  const res = await api.get<Politica[]>('/politicas')
  return res.data
}

export async function decidir(payload: {
  uf: string
  sub_assunto: string
  valor_causa: number
  policy: string
  include_shap?: boolean
  features_documentais?: Record<string, unknown>
}): Promise<ResultadoDecisao> {
  const res = await api.post<ResultadoDecisao>('/decidir', payload)
  return res.data
}

export async function obterMetricas(): Promise<Metricas> {
  const res = await api.get<Metricas>('/metricas')
  return res.data
}

export async function listarProcessosFinalizados(page = 1, uf?: string): Promise<ProcessoFinalizado[]> {
  const offset = (page - 1) * 20
  const res = await api.get<ProcessoFinalizado[]>('/processos-finalizados', {
    params: { limit: 20, offset, ...(uf ? { uf } : {}) },
  })
  return res.data
}
