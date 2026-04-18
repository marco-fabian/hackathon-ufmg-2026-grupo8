import type { CasoResumo } from '@/types/backend'
import type { Processo, SubAssunto } from '@/data/mockData'

const UF_TRIBUNAL: Record<string, string> = {
  MA: 'TJMA', AM: 'TJAM', SP: 'TJSP', RJ: 'TJRJ', MG: 'TJMG',
  RS: 'TJRS', BA: 'TJBA', PR: 'TJPR', SC: 'TJSC', GO: 'TJGO',
}

export function casoToProcesso(caso: CasoResumo): Processo {
  const isAcordo = caso.decisao === 'ACORDO'
  const alpha = 0.5
  const [p10, p90] = caso.valor_condenacao_faixa
  return {
    numeroCaso: caso.slug,
    uf: caso.uf,
    assunto: 'Não reconhece operação',
    subAssunto: caso.sub_assunto as SubAssunto,
    resultadoMacro: isAcordo ? 'Não Êxito' : 'Êxito',
    resultadoMicro: 'Parcial procedência',
    valorCausa: caso.valor_causa,
    valorCondenacao: isAcordo ? (caso.valor_acordo_sugerido ?? 0) / alpha : 0,
    statusDaIA: 'concluido',
    decisaoAdvogado: isAcordo ? 'acordo' : 'defesa',
    dataEntrada: new Date().toISOString(),
    advogadoResponsavel: 'Dr. Rafael Silva',
    tribunal: UF_TRIBUNAL[caso.uf] ?? `TJ${caso.uf}`,
    prioridade: caso.probabilidade_perda >= 0.5 ? 'alta' : 'baixa',
    scoreRisco: Math.round(caso.probabilidade_perda * 100),
    valorAcordoSugerido: caso.valor_acordo_sugerido,
    sugestoesValor: isAcordo ? [
      { valor: caso.valor_acordo_sugerido!, probabilidadeSucesso: 70 },
      { valor: Math.round(p10 * alpha), probabilidadeSucesso: 90 },
      { valor: Math.round(p90 * alpha), probabilidadeSucesso: 40 },
    ] : undefined,
  }
}
