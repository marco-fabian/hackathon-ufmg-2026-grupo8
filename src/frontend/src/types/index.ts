/**
 * types.ts — Shared domain types for EnterOS.
 * Import from here across all features.
 */

// ─── Common ───────────────────────────────────────────────────────────────

export type ID = string

export type StatusJuridico = 'Ativo' | 'Em Andamento' | 'Encerrado' | 'Urgente' | 'Suspenso' | 'Arquivado'

export type TipoProcesso =
  | 'Cível'
  | 'Trabalhista'
  | 'Tributário'
  | 'Societário'
  | 'Penal'
  | 'Administrativo'
  | 'Previdenciário'

export type RoleUsuario = 'socio' | 'associado' | 'estagiario' | 'admin' | 'financeiro'

// ─── Processo ─────────────────────────────────────────────────────────────

export interface Processo {
  id: ID
  numero: string
  cliente: string
  tipo: TipoProcesso
  status: StatusJuridico
  valorCausa: number
  prazoFinal?: string
  responsavel?: string
  criadoEm: string
  atualizadoEm: string
}

// ─── Cliente ──────────────────────────────────────────────────────────────

export interface Cliente {
  id: ID
  razaoSocial: string
  cnpj?: string
  cpf?: string
  email: string
  telefone?: string
  processos: number
  criadoEm: string
}

// ─── Usuário ──────────────────────────────────────────────────────────────

export interface Usuario {
  id: ID
  nome: string
  email: string
  role: RoleUsuario
  avatarUrl?: string
}

// ─── API ──────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
  meta?: PaginationMeta
}

export interface PaginationMeta {
  page: number
  perPage: number
  total: number
  totalPages: number
}

export interface ApiError {
  message: string
  code?: string
  field?: string
}
