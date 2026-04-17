import { Scale, Clock, BrainCircuit } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { mockProcessos, mockStats } from '@/data/mockData'
import { useView } from '@/context/ViewContext'
import { Link } from 'react-router-dom'

export default function FilaPage() {
  const { userRole } = useView()

  const statusColor: Record<string, string> = {
    pendente: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    em_analise: 'text-blue-600 bg-blue-50 border-blue-200',
    concluido: 'text-green-600 bg-green-50 border-green-200',
    aguardando_subsidios: 'text-orange-600 bg-orange-50 border-orange-200',
  }

  const statusLabel: Record<string, string> = {
    pendente: 'Pendente',
    em_analise: 'Em Análise',
    concluido: 'Concluído',
    aguardando_subsidios: 'Aguardando Subsídios',
  }

  return (
    <DashboardLayout pageTitle="Fila de Processos">
      <div className="space-y-6">
        {/* Summary chips */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
            <Scale size={16} className="text-indigo-500" />
            <span className="text-sm font-semibold text-slate-700">{mockStats.totalProcessos} processos</span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
            <Clock size={16} className="text-orange-500" />
            <span className="text-sm font-semibold text-slate-700">{mockStats.pendentesIA} aguardando IA</span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
            <BrainCircuit size={16} className="text-blue-500" />
            <span className="text-sm font-semibold text-slate-700">{mockStats.emAnaliseIA} em análise</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Número do Processo</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">UF</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Sub-assunto</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Valor Causa</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Status IA</th>
                  {userRole === 'banco' && (
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Risco IA</th>
                  )}
                  <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mockProcessos.map((proc) => (
                  <tr key={proc.numeroCaso} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{proc.numeroCaso}</td>
                    <td className="px-4 py-3 text-slate-600">{proc.uf}</td>
                    <td className="px-4 py-3 text-slate-600">{proc.subAssunto}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {proc.valorCausa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusColor[proc.statusDaIA]}`}>
                        {statusLabel[proc.statusDaIA]}
                      </span>
                    </td>
                    {userRole === 'banco' && (
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold text-sm ${proc.scoreRisco >= 70 ? 'text-red-600' : proc.scoreRisco >= 40 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {proc.scoreRisco}
                        </span>
                        <span className="text-slate-400 text-xs">/100</span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      <Link
                        to="/analise"
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        Analisar →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
