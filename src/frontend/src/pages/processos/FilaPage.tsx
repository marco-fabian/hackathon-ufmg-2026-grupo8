import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { listarProcessosFinalizados } from '@/services/casosService'
import type { ProcessoFinalizado } from '@/types/backend'

const PAGE_SIZE = 20

type ResultadoDisplay = 'Improcedente' | 'Procedente' | 'Parcialmente' | 'Extinto' | 'Outro'

const RESULTADO_STYLE: Record<ResultadoDisplay, string> = {
  'Improcedente': 'text-green-700 bg-green-50 border-green-200',
  'Extinto':      'text-green-700 bg-green-50 border-green-200',
  'Parcialmente': 'text-amber-700 bg-amber-50 border-amber-200',
  'Procedente':   'text-red-700 bg-red-50 border-red-200',
  'Outro':        'text-slate-600 bg-slate-50 border-slate-200',
}

function toResultadoDisplay(micro: string): ResultadoDisplay {
  if (micro.includes('Improcedência')) return 'Improcedente'
  if (micro.includes('Procedência') && micro.includes('Parcial')) return 'Parcialmente'
  if (micro.includes('Procedência')) return 'Procedente'
  if (micro.includes('Extinção')) return 'Extinto'
  return 'Outro'
}

export default function FilaPage() {
  const [processos, setProcessos] = useState<ProcessoFinalizado[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setErro(null)
    listarProcessosFinalizados(page)
      .then(setProcessos)
      .catch(() => setErro('Erro ao carregar processos.'))
      .finally(() => setLoading(false))
  }, [page])

  const hasPrev = page > 1
  const hasNext = processos.length === PAGE_SIZE

  return (
    <DashboardLayout pageTitle="Processos Finalizados">
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Carregando...</div>
          ) : erro ? (
            <div className="p-8 text-center text-red-500 text-sm">{erro}</div>
          ) : processos.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">Nenhum processo encontrado.</div>
          ) : (
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
                  {processos.map((proc) => {
                    const resultado = toResultadoDisplay(proc.resultado_micro)
                    return (
                      <tr key={proc.processo_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{proc.processo_id}</td>
                        <td className="px-4 py-3 text-slate-600">{proc.uf}</td>
                        <td className="px-4 py-3 text-slate-600">{proc.sub_assunto}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${RESULTADO_STYLE[resultado]}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {resultado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">
                          {proc.valor_causa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">
                          {proc.valor_condenacao > 0
                            ? proc.valor_condenacao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : <span className="text-slate-400 font-normal text-xs">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paginação */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-slate-500">
            Página {page} · {processos.length} registros
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={!hasPrev || loading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!hasNext || loading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próxima →
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
