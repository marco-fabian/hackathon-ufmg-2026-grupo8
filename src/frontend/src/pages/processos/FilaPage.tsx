import { useMemo } from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { mockProcessos, type Processo } from '@/data/mockData'

type ResultadoFinal = 'Acordo' | 'Extinto' | 'Improcedente' | 'Parcialmente' | 'Procedente'

function deriveResultado(p: Processo): ResultadoFinal {
  if (p.decisaoAdvogado === 'acordo') return 'Acordo'
  switch (p.resultadoMicro) {
    case 'Improcedência':      return 'Improcedente'
    case 'Parcial procedência': return 'Parcialmente'
    case 'Procedência':        return 'Procedente'
    case 'Extinção':           return 'Extinto'
    default:                   return 'Parcialmente'
  }
}

const RESULTADO_STYLE: Record<ResultadoFinal, string> = {
  'Acordo':       'text-blue-700 bg-blue-50 border-blue-200',
  'Extinto':      'text-green-700 bg-green-50 border-green-200',
  'Improcedente': 'text-green-700 bg-green-50 border-green-200',
  'Parcialmente': 'text-amber-700 bg-amber-50 border-amber-200',
  'Procedente':   'text-red-700 bg-red-50 border-red-200',
}

export default function FilaPage() {
  const processosFinalizados = useMemo(
    () => mockProcessos.filter(p => p.decisaoAdvogado !== 'pendente'),
    []
  )

  return (
    <DashboardLayout pageTitle="Processos Finalizados">
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Número do Processo</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">UF</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Sub-assunto</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Resultado</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Valor da Causa</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Valor da Condenação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processosFinalizados.map((proc) => {
                  const resultado = deriveResultado(proc)
                  return (
                    <tr key={proc.numeroCaso} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{proc.numeroCaso}</td>
                      <td className="px-4 py-3 text-slate-600">{proc.uf}</td>
                      <td className="px-4 py-3 text-slate-600">{proc.subAssunto}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${RESULTADO_STYLE[resultado]}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {resultado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {proc.valorCausa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {proc.valorCondenacao > 0
                          ? proc.valorCondenacao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : <span className="text-slate-400 font-normal text-xs">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
