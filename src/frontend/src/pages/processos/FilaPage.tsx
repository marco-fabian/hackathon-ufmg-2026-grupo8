import { useEffect, useMemo, useState } from 'react'
import { Scale, CheckCircle2, XCircle, FileSearch, UserCheck, ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { mockProcessos, mockStats, type Processo } from '@/data/mockData'
import { useView } from '@/context/ViewContext'
import { Link } from 'react-router-dom'
import { listarCasos } from '@/services/casosService'
import { casoToProcesso } from '@/utils/backendToProcesso'

type FilterStatus = 'todos' | 'concluido' | 'concluido_aceito' | 'concluido_rejeitado' | 'aguardando_subsidios' | 'aguardando_aprovacao_advogado' | 'aguardando_aprovacao_juiz'
type SortKey = keyof Pick<Processo, 'numeroCaso' | 'uf' | 'subAssunto' | 'valorCausa' | 'valorAcordoSugerido' | 'statusDaIA'>
type SortDir = 'asc' | 'desc'

export default function FilaPage() {
  const { userRole } = useView()
  const [processos, setProcessos] = useState<Processo[]>(mockProcessos)
  const [filtro, setFiltro] = useState<FilterStatus>('todos')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [busca, setBusca] = useState('')
  const [ufSelecionada, setUfSelecionada] = useState('')

  useEffect(() => {
    listarCasos()
      .then(casos => setProcessos([...casos.map(casoToProcesso), ...mockProcessos]))
      .catch(() => { /* fica no mock */ })
  }, [])

  const ufs = useMemo(() => Array.from(new Set(processos.map((p) => p.uf))).sort(), [processos])

  const statusColor: Record<string, string> = {
    concluido: 'text-green-600 bg-green-50 border-green-200',
    concluido_aceito: 'text-emerald-700 bg-emerald-50 border-emerald-300',
    concluido_rejeitado: 'text-red-600 bg-red-50 border-red-200',
    aguardando_subsidios: 'text-orange-600 bg-orange-50 border-orange-200',
    aguardando_aprovacao_advogado: 'text-purple-600 bg-purple-50 border-purple-200',
    aguardando_aprovacao_juiz: 'text-blue-600 bg-blue-50 border-blue-200',
    pendente: 'text-slate-500 bg-slate-50 border-slate-200',
  }

  const statusLabel: Record<string, string> = {
    concluido: 'Concluído',
    concluido_aceito: 'Concluído - Aceito',
    concluido_rejeitado: 'Concluído - Rejeitado',
    aguardando_subsidios: 'Aguardando Subsídios',
    aguardando_aprovacao_advogado: 'Aguardando Aprovação - Advogado',
    aguardando_aprovacao_juiz: 'Aguardando Aprovação - Juiz',
    pendente: 'Pendente',
  }

  const normalizeStatus = (s: string): string =>
    s in statusColor ? s : 'pendente'

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown size={13} className="text-slate-400" />
    return sortDir === 'asc'
      ? <ChevronUp size={13} className="text-indigo-500" />
      : <ChevronDown size={13} className="text-indigo-500" />
  }

  const sorted = useMemo(() => {
    let list = filtro === 'todos'
      ? [...processos]
      : filtro === 'concluido'
        ? processos.filter((p) => p.statusDaIA === 'concluido' || p.statusDaIA === 'concluido_aceito' || p.statusDaIA === 'concluido_rejeitado')
        : processos.filter((p) => p.statusDaIA === filtro)

    if (ufSelecionada) list = list.filter((p) => p.uf === ufSelecionada)
    if (busca.trim()) list = list.filter((p) =>
      p.numeroCaso.toLowerCase().includes(busca.toLowerCase()) ||
      p.subAssunto.toLowerCase().includes(busca.toLowerCase())
    )

    if (sortKey) {
      list.sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [processos, filtro, ufSelecionada, busca, sortKey, sortDir])

  const chipBase =
    'flex items-center gap-2 rounded-lg px-4 py-2 border cursor-pointer transition-all select-none text-left'

  const chipStyle = (key: FilterStatus, active: string, inactive: string) =>
    filtro === key
      ? `${chipBase} ${active} ring-2 ring-offset-1`
      : `${chipBase} bg-white ${inactive} shadow-sm opacity-70 hover:opacity-100`

  const thBtn = 'flex items-center gap-1 cursor-pointer hover:text-indigo-600 transition-colors select-none'

  return (
    <DashboardLayout pageTitle="Fila de Processos">
      <div className="space-y-6">
        {/* Summary chips */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setFiltro('todos')}
            className={chipStyle('todos', 'bg-indigo-50 border-indigo-400 ring-indigo-300', 'border-slate-200')}
          >
            <Scale size={16} className="text-indigo-500" />
            <span className="text-sm font-semibold text-slate-700">{mockStats.totalProcessos} processos</span>
          </button>

          {userRole !== 'banco' ? (
            <button
              onClick={() => setFiltro('concluido')}
              className={chipStyle('concluido', 'bg-green-50 border-green-400 ring-green-300', 'border-green-200')}
            >
              <CheckCircle2 size={16} className="text-green-500" />
              <span className="text-sm font-semibold text-green-700">{mockStats.concluidoCount} concluídos</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setFiltro('concluido_aceito')}
                className={chipStyle('concluido_aceito', 'bg-emerald-50 border-emerald-500 ring-emerald-300', 'border-emerald-300')}
              >
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-700">{mockStats.concluido_aceitoCount} concluídos - aceito</span>
              </button>
              <button
                onClick={() => setFiltro('concluido_rejeitado')}
                className={chipStyle('concluido_rejeitado', 'bg-red-50 border-red-400 ring-red-300', 'border-red-200')}
              >
                <XCircle size={16} className="text-red-500" />
                <span className="text-sm font-semibold text-red-700">{mockStats.concluido_rejeitadoCount} concluídos - rejeitado</span>
              </button>
            </>
          )}

          <button
            onClick={() => setFiltro('aguardando_subsidios')}
            className={chipStyle('aguardando_subsidios', 'bg-orange-50 border-orange-400 ring-orange-300', 'border-orange-200')}
          >
            <FileSearch size={16} className="text-orange-500" />
            <span className="text-sm font-semibold text-orange-700">{mockStats.aguardandoSubsidiosCount} aguardando subsídios</span>
          </button>

          <button
            onClick={() => setFiltro('aguardando_aprovacao_advogado')}
            className={chipStyle('aguardando_aprovacao_advogado', 'bg-purple-50 border-purple-400 ring-purple-300', 'border-purple-200')}
          >
            <UserCheck size={16} className="text-purple-500" />
            <span className="text-sm font-semibold text-purple-700">{mockStats.aguardandoAprovacaoAdvogadoCount} aguardando aprovação - advogado</span>
          </button>
        </div>

        {/* Search & filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar número do processo ou sub-assunto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder:text-slate-400"
            />
          </div>

          <select
            value={ufSelecionada}
            onChange={(e) => setUfSelecionada(e.target.value)}
            className="py-2 pl-3 pr-8 text-sm border border-slate-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 text-slate-700 cursor-pointer"
          >
            <option value="">Todos os estados</option>
            {ufs.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>

          {(busca || ufSelecionada) && (
            <button
              onClick={() => { setBusca(''); setUfSelecionada('') }}
              className="text-xs text-slate-500 hover:text-slate-700 underline transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                    <button className={thBtn} onClick={() => handleSort('numeroCaso')}>
                      Número do Processo <SortIcon col="numeroCaso" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                    <button className={thBtn} onClick={() => handleSort('uf')}>
                      UF <SortIcon col="uf" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                    <button className={thBtn} onClick={() => handleSort('subAssunto')}>
                      Sub-assunto <SortIcon col="subAssunto" />
                    </button>
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                    <button className={`${thBtn} ml-auto`} onClick={() => handleSort('valorCausa')}>
                      Valor Causa <SortIcon col="valorCausa" />
                    </button>
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                    <button className={`${thBtn} ml-auto`} onClick={() => handleSort('valorAcordoSugerido')}>
                      Sugestão IA <SortIcon col="valorAcordoSugerido" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                    <button className={thBtn} onClick={() => handleSort('statusDaIA')}>
                      Status <SortIcon col="statusDaIA" />
                    </button>
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">
                      Nenhum processo encontrado.
                    </td>
                  </tr>
                ) : sorted.map((proc) => (
                  <tr key={proc.numeroCaso} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{proc.numeroCaso}</td>
                    <td className="px-4 py-3 text-slate-600">{proc.uf}</td>
                    <td className="px-4 py-3 text-slate-600">{proc.subAssunto}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {proc.valorCausa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${
                      proc.statusDaIA === 'concluido_aceito' ? 'text-emerald-600'
                      : proc.statusDaIA === 'concluido_rejeitado' ? 'text-red-600'
                      : 'text-slate-800'
                    }`}>
                      {proc.statusDaIA !== 'aguardando_subsidios' && proc.valorAcordoSugerido != null
                        ? proc.valorAcordoSugerido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : <span className="text-slate-400 font-normal text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {(() => { const s = normalizeStatus(proc.statusDaIA); return (
                        <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusColor[s]}`}>
                          {statusLabel[s]}
                        </span>
                      )})()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        to={`/analise?id=${proc.numeroCaso}`}
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
