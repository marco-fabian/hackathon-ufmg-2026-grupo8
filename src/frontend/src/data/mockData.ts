// ─── Interfaces ───────────────────────────────────────────────────────────────

/** Resultado macro do processo conforme base Excel */
export type ResultadoMacro = 'Êxito' | 'Não Êxito'

/** Resultado micro do processo conforme base Excel */
export type ResultadoMicro =
  | 'Improcedência'
  | 'Parcial procedência'
  | 'Procedência'
  | 'Extinção'

/** Sub-assunto do caso */
export type SubAssunto = 'Golpe' | 'Genérico' | 'Phishing' | 'Clonagem de cartão'

/** Status de análise da IA no contexto do hackathon */
export type StatusIA =
  | 'pendente'
  | 'em_analise'
  | 'concluido'
  | 'aguardando_subsidios'

/** Decisão do advogado responsável */
export type DecisaoAdvogado = 'acordo' | 'defesa' | 'pendente'

/** Prioridade do processo na fila */
export type Prioridade = 'alta' | 'media' | 'baixa'

/**
 * Processo judicial — baseado nas colunas do Excel
 * "Hackaton_Enter_Base_Candidatos.xlsx" (sheet: Resultados dos processos)
 */
export interface Processo {
  /** Número CNJ do processo (ex: 1764352-89.2025.8.06.1818) */
  numeroCaso: string
  /** Unidade Federativa onde tramita o processo */
  uf: string
  /** Assunto principal — sempre "Não reconhece operação" */
  assunto: string
  /** Sub-assunto específico do caso */
  subAssunto: SubAssunto
  /** Resultado macro: banco ganhou (Êxito) ou perdeu (Não Êxito) */
  resultadoMacro: ResultadoMacro
  /** Resultado micro: detalhe da decisão judicial */
  resultadoMicro: ResultadoMicro
  /** Valor pedido pelo autor (R$) */
  valorCausa: number
  /** Valor condenado / indenização arbitrada (R$) — 0 se improcedente */
  valorCondenacao: number
  /** Status atual do fluxo de IA */
  statusDaIA: StatusIA
  /** Decisão tomada pelo advogado */
  decisaoAdvogado: DecisaoAdvogado
  /** Data de entrada na fila (ISO 8601) */
  dataEntrada: string
  /** Advogado responsável pelo caso */
  advogadoResponsavel: string
  /** Tribunal de origem */
  tribunal: string
  /** Prioridade de análise */
  prioridade: Prioridade
  /** Score de risco calculado pela IA (0–100) */
  scoreRisco: number
  /** Recomendação de acordo sugerida pela IA (R$) */
  valorAcordoSugerido: number | null
}

/**
 * Subsídio documental atrelado a um processo
 * (sheet: Subsídios disponibilizados — 0=ausente, 1=presente)
 */
export interface Subsidio {
  /** Número CNJ do processo ao qual o subsídio pertence */
  numeroCaso: string
  /** Contrato de empréstimo/crédito */
  contrato: boolean
  /** Extrato bancário do período */
  extrato: boolean
  /** Comprovante de crédito BACEN */
  comprovanteCredito: boolean
  /** Dossiê Veritas do cliente */
  dossie: boolean
  /** Demonstrativo de evolução da dívida */
  demonstrativoDivida: boolean
  /** Laudo referenciado (perícia) */
  laudoReferenciado: boolean
}

// ─── Dados reais do Excel (primeiros 15 processos) ───────────────────────────

const advogados = [
  'Dra. Mariana Costa',
  'Dr. Rafael Silva',
  'Dra. Juliana Alves',
  'Dr. Thiago Ferreira',
  'Dra. Carolina Mendes',
  'Dr. Bruno Oliveira',
]

function calcScoreRisco(
  resultadoMicro: ResultadoMicro,
  valorCausa: number,
  valorCondenacao: number
): number {
  const base =
    resultadoMicro === 'Procedência'
      ? 85
      : resultadoMicro === 'Parcial procedência'
        ? 62
        : resultadoMicro === 'Extinção'
          ? 30
          : 10
  const proporcao = valorCondenacao > 0 ? (valorCondenacao / valorCausa) * 20 : 0
  return Math.min(100, Math.round(base + proporcao))
}

function calcAcordoSugerido(
  resultadoMacro: ResultadoMacro,
  valorCondenacao: number
): number | null {
  if (resultadoMacro === 'Êxito') return null
  return Math.round(valorCondenacao * 0.65 * 100) / 100
}

/** Mock de processos baseado nos dados reais do Excel (60.000 registros reais) */
export const mockProcessos: Processo[] = [
  // ── Linha 1 do Excel ──────────────────────────────────────────────────────
  {
    numeroCaso: '1764352-89.2025.8.06.1818',
    uf: 'CE',
    assunto: 'Não reconhece operação',
    subAssunto: 'Genérico',
    resultadoMacro: 'Não Êxito',
    resultadoMicro: 'Parcial procedência',
    valorCausa: 13534.0,
    valorCondenacao: 7714.38,
    statusDaIA: 'concluido',
    decisaoAdvogado: 'acordo',
    dataEntrada: '2025-01-08T09:12:00Z',
    advogadoResponsavel: advogados[0],
    tribunal: 'TJCE',
    prioridade: 'alta',
    scoreRisco: calcScoreRisco('Parcial procedência', 13534, 7714.38),
    valorAcordoSugerido: calcAcordoSugerido('Não Êxito', 7714.38),
  },
  // ── Linha 2 ───────────────────────────────────────────────────────────────
  {
    numeroCaso: '5638325-36.2025.8.17.4124',
    uf: 'PE',
    assunto: 'Não reconhece operação',
    subAssunto: 'Golpe',
    resultadoMacro: 'Não Êxito',
    resultadoMicro: 'Parcial procedência',
    valorCausa: 7883.63,
    valorCondenacao: 3784.14,
    statusDaIA: 'concluido',
    decisaoAdvogado: 'acordo',
    dataEntrada: '2025-01-10T14:32:00Z',
    advogadoResponsavel: advogados[1],
    tribunal: 'TJPE',
    prioridade: 'media',
    scoreRisco: calcScoreRisco('Parcial procedência', 7883.63, 3784.14),
    valorAcordoSugerido: calcAcordoSugerido('Não Êxito', 3784.14),
  },
  // ── Linha 3 ───────────────────────────────────────────────────────────────
  {
    numeroCaso: '1037491-89.2025.8.18.1658',
    uf: 'PI',
    assunto: 'Não reconhece operação',
    subAssunto: 'Golpe',
    resultadoMacro: 'Não Êxito',
    resultadoMicro: 'Parcial procedência',
    valorCausa: 8561.97,
    valorCondenacao: 6507.1,
    statusDaIA: 'em_analise',
    decisaoAdvogado: 'pendente',
    dataEntrada: '2025-01-11T08:45:00Z',
    advogadoResponsavel: advogados[2],
    tribunal: 'TJPI',
    prioridade: 'alta',
    scoreRisco: calcScoreRisco('Parcial procedência', 8561.97, 6507.1),
    valorAcordoSugerido: calcAcordoSugerido('Não Êxito', 6507.1),
  },
  // ── Linha 4 ───────────────────────────────────────────────────────────────
  {
    numeroCaso: '9547931-23.2025.8.04.4188',
    uf: 'AM',
    assunto: 'Não reconhece operação',
    subAssunto: 'Golpe',
    resultadoMacro: 'Êxito',
    resultadoMicro: 'Improcedência',
    valorCausa: 5693.13,
    valorCondenacao: 0,
    statusDaIA: 'concluido',
    decisaoAdvogado: 'defesa',
    dataEntrada: '2025-01-12T11:00:00Z',
    advogadoResponsavel: advogados[3],
    tribunal: 'TJAM',
    prioridade: 'baixa',
    scoreRisco: calcScoreRisco('Improcedência', 5693.13, 0),
    valorAcordoSugerido: null,
  },
  // ── Linha 5 ───────────────────────────────────────────────────────────────
  {
    numeroCaso: '9999446-69.2025.8.04.4264',
    uf: 'AM',
    assunto: 'Não reconhece operação',
    subAssunto: 'Golpe',
    resultadoMacro: 'Êxito',
    resultadoMicro: 'Improcedência',
    valorCausa: 8515.67,
    valorCondenacao: 0,
    statusDaIA: 'concluido',
    decisaoAdvogado: 'defesa',
    dataEntrada: '2025-01-13T10:20:00Z',
    advogadoResponsavel: advogados[4],
    tribunal: 'TJAM',
    prioridade: 'baixa',
    scoreRisco: calcScoreRisco('Improcedência', 8515.67, 0),
    valorAcordoSugerido: null,
  },
  // ── Linha 6 ───────────────────────────────────────────────────────────────
  {
    numeroCaso: '2412149-28.2025.8.24.1145',
    uf: 'SC',
    assunto: 'Não reconhece operação',
    subAssunto: 'Genérico',
    resultadoMacro: 'Não Êxito',
    resultadoMicro: 'Parcial procedência',
    valorCausa: 16961.06,
    valorCondenacao: 12720.8,
    statusDaIA: 'aguardando_subsidios',
    decisaoAdvogado: 'pendente',
    dataEntrada: '2025-01-14T13:15:00Z',
    advogadoResponsavel: advogados[5],
    tribunal: 'TJSC',
    prioridade: 'alta',
    scoreRisco: calcScoreRisco('Parcial procedência', 16961.06, 12720.8),
    valorAcordoSugerido: calcAcordoSugerido('Não Êxito', 12720.8),
  },
  // ── Linha 7 ───────────────────────────────────────────────────────────────
  {
    numeroCaso: '8874499-95.2025.8.07.3223',
    uf: 'DF',
    assunto: 'Não reconhece operação',
    subAssunto: 'Golpe',
    resultadoMacro: 'Não Êxito',
    resultadoMicro: 'Procedência',
    valorCausa: 11180.0,
    valorCondenacao: 11180.0,
    statusDaIA: 'concluido',
    decisaoAdvogado: 'acordo',
    dataEntrada: '2025-01-15T09:30:00Z',
    advogadoResponsavel: advogados[0],
    tribunal: 'TJDFT',
    prioridade: 'alta',
    scoreRisco: calcScoreRisco('Procedência', 11180, 11180),
    valorAcordoSugerido: calcAcordoSugerido('Não Êxito', 11180),
  },
  // ── Linha 8 ───────────────────────────────────────────────────────────────
  {
    numeroCaso: '1917160-43.2025.8.07.3360',
    uf: 'DF',
    assunto: 'Não reconhece operação',
    subAssunto: 'Golpe',
    resultadoMacro: 'Êxito',
    resultadoMicro: 'Extinção',
    valorCausa: 20060.4,
    valorCondenacao: 0,
    statusDaIA: 'concluido',
    decisaoAdvogado: 'defesa',
    dataEntrada: '2025-01-16T16:00:00Z',
    advogadoResponsavel: advogados[1],
    tribunal: 'TJDFT',
    prioridade: 'media',
    scoreRisco: calcScoreRisco('Extinção', 20060.4, 0),
    valorAcordoSugerido: null,
  },
  // ── Linha 9 ───────────────────────────────────────────────────────────────
  {
    numeroCaso: '6064536-08.2025.8.05.2439',
    uf: 'BA',
    assunto: 'Não reconhece operação',
    subAssunto: 'Golpe',
    resultadoMacro: 'Não Êxito',
    resultadoMicro: 'Parcial procedência',
    valorCausa: 16021.5,
    valorCondenacao: 9773.12,
    statusDaIA: 'em_analise',
    decisaoAdvogado: 'pendente',
    dataEntrada: '2025-01-17T08:00:00Z',
    advogadoResponsavel: advogados[2],
    tribunal: 'TJBA',
    prioridade: 'alta',
    scoreRisco: calcScoreRisco('Parcial procedência', 16021.5, 9773.12),
    valorAcordoSugerido: calcAcordoSugerido('Não Êxito', 9773.12),
  },
  // ── Linha 10 ──────────────────────────────────────────────────────────────
  {
    numeroCaso: '1921027-43.2025.8.15.3964',
    uf: 'PB',
    assunto: 'Não reconhece operação',
    subAssunto: 'Golpe',
    resultadoMacro: 'Êxito',
    resultadoMicro: 'Extinção',
    valorCausa: 16520.52,
    valorCondenacao: 0,
    statusDaIA: 'pendente',
    decisaoAdvogado: 'pendente',
    dataEntrada: '2025-01-18T10:45:00Z',
    advogadoResponsavel: advogados[3],
    tribunal: 'TJPB',
    prioridade: 'baixa',
    scoreRisco: calcScoreRisco('Extinção', 16520.52, 0),
    valorAcordoSugerido: null,
  },
  // ── Linha 11 ──────────────────────────────────────────────────────────────
  {
    numeroCaso: '3847261-52.2025.8.13.0024',
    uf: 'MG',
    assunto: 'Não reconhece operação',
    subAssunto: 'Phishing',
    resultadoMacro: 'Não Êxito',
    resultadoMicro: 'Procedência',
    valorCausa: 22500.0,
    valorCondenacao: 22500.0,
    statusDaIA: 'concluido',
    decisaoAdvogado: 'acordo',
    dataEntrada: '2026-04-01T11:30:00Z',
    advogadoResponsavel: advogados[4],
    tribunal: 'TJMG',
    prioridade: 'alta',
    scoreRisco: calcScoreRisco('Procedência', 22500, 22500),
    valorAcordoSugerido: calcAcordoSugerido('Não Êxito', 22500),
  },
  // ── Linha 12 ──────────────────────────────────────────────────────────────
  {
    numeroCaso: '7236541-98.2025.8.26.0100',
    uf: 'SP',
    assunto: 'Não reconhece operação',
    subAssunto: 'Clonagem de cartão',
    resultadoMacro: 'Não Êxito',
    resultadoMicro: 'Parcial procedência',
    valorCausa: 31200.0,
    valorCondenacao: 18720.0,
    statusDaIA: 'em_analise',
    decisaoAdvogado: 'pendente',
    dataEntrada: '2026-04-05T14:00:00Z',
    advogadoResponsavel: advogados[5],
    tribunal: 'TJSP',
    prioridade: 'alta',
    scoreRisco: calcScoreRisco('Parcial procedência', 31200, 18720),
    valorAcordoSugerido: calcAcordoSugerido('Não Êxito', 18720),
  },
  // ── Linha 13 ──────────────────────────────────────────────────────────────
  {
    numeroCaso: '4129034-71.2025.8.19.0001',
    uf: 'RJ',
    assunto: 'Não reconhece operação',
    subAssunto: 'Golpe',
    resultadoMacro: 'Êxito',
    resultadoMicro: 'Improcedência',
    valorCausa: 9800.0,
    valorCondenacao: 0,
    statusDaIA: 'concluido',
    decisaoAdvogado: 'defesa',
    dataEntrada: '2026-04-08T09:00:00Z',
    advogadoResponsavel: advogados[0],
    tribunal: 'TJRJ',
    prioridade: 'media',
    scoreRisco: calcScoreRisco('Improcedência', 9800, 0),
    valorAcordoSugerido: null,
  },
  // ── Linha 14 ──────────────────────────────────────────────────────────────
  {
    numeroCaso: '8801234-55.2025.8.16.0030',
    uf: 'PR',
    assunto: 'Não reconhece operação',
    subAssunto: 'Genérico',
    resultadoMacro: 'Não Êxito',
    resultadoMicro: 'Parcial procedência',
    valorCausa: 14750.0,
    valorCondenacao: 8850.0,
    statusDaIA: 'aguardando_subsidios',
    decisaoAdvogado: 'pendente',
    dataEntrada: '2026-04-10T15:30:00Z',
    advogadoResponsavel: advogados[1],
    tribunal: 'TJPR',
    prioridade: 'media',
    scoreRisco: calcScoreRisco('Parcial procedência', 14750, 8850),
    valorAcordoSugerido: calcAcordoSugerido('Não Êxito', 8850),
  },
  // ── Linha 15 ──────────────────────────────────────────────────────────────
  {
    numeroCaso: '5512877-19.2025.8.09.0051',
    uf: 'GO',
    assunto: 'Não reconhece operação',
    subAssunto: 'Phishing',
    resultadoMacro: 'Não Êxito',
    resultadoMicro: 'Procedência',
    valorCausa: 19400.0,
    valorCondenacao: 19400.0,
    statusDaIA: 'concluido',
    decisaoAdvogado: 'acordo',
    dataEntrada: '2026-04-15T12:00:00Z',
    advogadoResponsavel: advogados[2],
    tribunal: 'TJGO',
    prioridade: 'alta',
    scoreRisco: calcScoreRisco('Procedência', 19400, 19400),
    valorAcordoSugerido: calcAcordoSugerido('Não Êxito', 19400),
  },
]

// ─── Mock de Subsídios ─────────────────────────────────────────────────────────
/**
 * Subsídios documentais por processo.
 * Mapeados diretamente da sheet "Subsídios disponibilizados" do Excel.
 * 1 = presente, 0 = ausente.
 */
export const mockSubsidios: Subsidio[] = [
  // processo 1 (Dossiê + Demonstrativo + Laudo)
  { numeroCaso: '1764352-89.2025.8.06.1818', contrato: false, extrato: false, comprovanteCredito: false, dossie: true, demonstrativoDivida: true, laudoReferenciado: true },
  // processo 2 (Contrato + Extrato + Dossiê + Demonstrativo + Laudo)
  { numeroCaso: '5638325-36.2025.8.17.4124', contrato: true, extrato: true, comprovanteCredito: false, dossie: true, demonstrativoDivida: true, laudoReferenciado: true },
  // processo 3 (Extrato + Comprovante + Dossiê + Demonstrativo)
  { numeroCaso: '1037491-89.2025.8.18.1658', contrato: false, extrato: true, comprovanteCredito: true, dossie: true, demonstrativoDivida: true, laudoReferenciado: false },
  // processo 4 (todos)
  { numeroCaso: '9547931-23.2025.8.04.4188', contrato: true, extrato: true, comprovanteCredito: true, dossie: true, demonstrativoDivida: true, laudoReferenciado: false },
  // processo 5 (todos)
  { numeroCaso: '9999446-69.2025.8.04.4264', contrato: true, extrato: true, comprovanteCredito: true, dossie: true, demonstrativoDivida: false, laudoReferenciado: false },
  // processo 6 (Contrato + Extrato + Laudo)
  { numeroCaso: '2412149-28.2025.8.24.1145', contrato: true, extrato: true, comprovanteCredito: false, dossie: false, demonstrativoDivida: false, laudoReferenciado: true },
  // processo 7 (todos exceto comprovante)
  { numeroCaso: '8874499-95.2025.8.07.3223', contrato: true, extrato: true, comprovanteCredito: false, dossie: true, demonstrativoDivida: true, laudoReferenciado: true },
  // processo 8 (apenas dossiê e laudo)
  { numeroCaso: '1917160-43.2025.8.07.3360', contrato: false, extrato: false, comprovanteCredito: false, dossie: true, demonstrativoDivida: false, laudoReferenciado: true },
  // processo 9 (todos exceto contrato)
  { numeroCaso: '6064536-08.2025.8.05.2439', contrato: false, extrato: true, comprovanteCredito: true, dossie: true, demonstrativoDivida: true, laudoReferenciado: true },
  // processo 10 (nenhum subsídio)
  { numeroCaso: '1921027-43.2025.8.15.3964', contrato: false, extrato: false, comprovanteCredito: false, dossie: false, demonstrativoDivida: false, laudoReferenciado: false },
  // processo 11 (todos)
  { numeroCaso: '3847261-52.2025.8.13.0024', contrato: true, extrato: true, comprovanteCredito: true, dossie: true, demonstrativoDivida: true, laudoReferenciado: true },
  // processo 12 (Contrato + Extrato + Comprovante + Laudo)
  { numeroCaso: '7236541-98.2025.8.26.0100', contrato: true, extrato: true, comprovanteCredito: true, dossie: false, demonstrativoDivida: false, laudoReferenciado: true },
  // processo 13 (todos exceto laudo)
  { numeroCaso: '4129034-71.2025.8.19.0001', contrato: true, extrato: true, comprovanteCredito: true, dossie: true, demonstrativoDivida: true, laudoReferenciado: false },
  // processo 14 (apenas dossiê e demonstrativo)
  { numeroCaso: '8801234-55.2025.8.16.0030', contrato: false, extrato: false, comprovanteCredito: false, dossie: true, demonstrativoDivida: true, laudoReferenciado: false },
  // processo 15 (todos)
  { numeroCaso: '5512877-19.2025.8.09.0051', contrato: true, extrato: true, comprovanteCredito: true, dossie: true, demonstrativoDivida: true, laudoReferenciado: true },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retorna o Processo pelo numero CNJ */
export function getProcessoByNumero(numeroCaso: string): Processo | undefined {
  return mockProcessos.find((p) => p.numeroCaso === numeroCaso)
}

/** Retorna os subsídios de um processo */
export function getSubsidiosByNumero(numeroCaso: string): Subsidio | undefined {
  return mockSubsidios.find((s) => s.numeroCaso === numeroCaso)
}

/** Retorna processos filtrados por status da IA */
export function getProcessosByStatus(status: StatusIA): Processo[] {
  return mockProcessos.filter((p) => p.statusDaIA === status)
}

/** Retorna processos filtrados por resultado macro */
export function getProcessosByResultado(resultado: ResultadoMacro): Processo[] {
  return mockProcessos.filter((p) => p.resultadoMacro === resultado)
}

/** Estatísticas resumidas para o dashboard */
export const mockStats = {
  totalProcessos: mockProcessos.length,
  exitoCount: mockProcessos.filter((p) => p.resultadoMacro === 'Êxito').length,
  naoExitoCount: mockProcessos.filter((p) => p.resultadoMacro === 'Não Êxito').length,
  pendentesIA: mockProcessos.filter((p) => p.statusDaIA === 'pendente').length,
  emAnaliseIA: mockProcessos.filter((p) => p.statusDaIA === 'em_analise').length,
  totalValorCausa: mockProcessos.reduce((acc, p) => acc + p.valorCausa, 0),
  totalCondenacao: mockProcessos.reduce((acc, p) => acc + p.valorCondenacao, 0),
  taxaExito:
    Math.round(
      (mockProcessos.filter((p) => p.resultadoMacro === 'Êxito').length /
        mockProcessos.length) *
        1000
    ) / 10,
}
