import { useState, useMemo, useEffect } from 'react'
import { Clock, Activity, UserCheck, Zap, Calendar, X } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DataTableBase, type ColumnDef, type SortDirection } from '@/components/data/DataTableBase'
import { ChartCardBase } from '@/components/data/ChartCardBase'
import { useView } from '@/context/ViewContext'
import { mockProcessos } from '@/data/mockData'

// ─── LÓGICA DE DADOS ──────────────────────────────────────────────────────────


function checkAderente(statusIA: string, decisaoAdv: string): boolean {
  return String(statusIA).toLowerCase() === String(decisaoAdv).toLowerCase()
}

const COLOR_SUCCESS = '#EA580C'   // laranja principal
const COLOR_DANGER  = '#1A1A1A'   // preto
const COLOR_BLUE    = '#F97316'   // laranja médio
const COLOR_AMBER   = '#FB923C'   // laranja claro
const COLOR_PURPLE  = '#7C2D12'   // marrom-laranja escuro

type ChartType = 'acuracia' | 'mes-a-mes' | 'economia' | 'por-uf'

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  icon: React.ReactNode
  subtitle?: string
}

function KpiCard({ label, value, icon, subtitle }: KpiCardProps) {
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '10px',
      padding: '20px',
      boxShadow: 'var(--shadow-card)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          flex: 1, fontSize: '12px', fontWeight: 600,
          color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {label}
        </span>
        <div style={{
          width: '32px', height: '32px', borderRadius: '8px',
          backgroundColor: 'var(--color-primary-50)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary-600)',
        }}>
          {icon}
        </div>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
          {value}
        </p>
        {subtitle && (
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Table Columns ─────────────────────────────────────────────────────────────

const COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: 'numeroCaso', header: 'Nº Processo', sortable: true, width: '220px' },
  { key: 'uf', header: 'UF', width: '100px', filterType: 'select' },
  { key: 'resultadoMicro', header: 'Resultado (Base)', sortable: true, filterType: 'select' },
  {
    key: 'decisaoAdvogado',
    header: 'Ação Atual',
    filterType: 'select',
    render: (val) => (
      <span style={{ fontSize: '12px', fontWeight: 500, textTransform: 'capitalize' }}>
        {String(val)}
      </span>
    ),
  },
  {
    key: 'valorCausa',
    header: 'Valor Causa',
    align: 'right',
    render: (val) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val)),
  },
]

// ─── Input style helper ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: '5px',
  fontSize: '11px',
  backgroundColor: 'var(--color-bg-card)',
  color: 'var(--color-text-primary)',
  outline: 'none',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { userRole } = useView()
  const [sortColumn, setSortColumn]     = useState<string | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [selectedChart, setSelectedChart] = useState<ChartType>('acuracia')
  const [filterMonth, setFilterMonth]   = useState('')
  const [filterDay, setFilterDay]       = useState('')

  const ADVOGADO_LOGADO = 'Dr. Rafael Silva'

  useEffect(() => {
    setSelectedChart(userRole === 'banco' ? 'acuracia' : 'mes-a-mes')
  }, [userRole])

  const processosAtuais = useMemo(() =>
    userRole === 'advogado'
      ? mockProcessos.filter(p => p.advogadoResponsavel === ADVOGADO_LOGADO)
      : mockProcessos
  , [userRole])

  // Base de dados com filtro de data aplicado para os gráficos
  const filteredBase = useMemo(() => {
    const base = userRole === 'banco' ? mockProcessos : processosAtuais
    if (filterDay)   return base.filter(p => p.dataEntrada.startsWith(filterDay))
    if (filterMonth) return base.filter(p => p.dataEntrada.startsWith(filterMonth))
    return base
  }, [userRole, processosAtuais, filterMonth, filterDay])

  // ─── KPI principais ──────────────────────────────────────────────────────
  const base = userRole === 'banco' ? mockProcessos : processosAtuais
  const CURRENT_MONTH = '2026-04'

  const aguardandoJulgamento = base.filter(p => p.statusDaIA === 'aguardando_subsidios').length
  const paraAvaliar = base.filter(p => p.decisaoAdvogado === 'pendente').length
  const analisadosNoMes = base.filter(
    p => p.decisaoAdvogado !== 'pendente' && p.dataEntrada.startsWith(CURRENT_MONTH)
  ).length
  const economizadoMotor = mockProcessos
    .filter(p => p.valorAcordoSugerido !== null)
    .reduce((acc, p) => acc + Math.max(0, p.valorCondenacao - (p.valorAcordoSugerido ?? 0)), 0)


  // ─── Dados: Acurácia IA vs Advogado ──────────────────────────────────────
  const acuraciaData = useMemo(() => {
    let acatada = 0, naoAcatada = 0
    filteredBase.forEach(p => {
      if (checkAderente(p.statusDaIA, p.decisaoAdvogado)) acatada++
      else naoAcatada++
    })
    return [{ name: 'Sugestão IA', Acatada: acatada, 'Não Acatada': naoAcatada }]
  }, [filteredBase])

  // ─── Dados: Mês a Mês ────────────────────────────────────────────────────
  const mesMesData = useMemo(() => {
    const byMonth: Record<string, { name: string, 'Em Andamento': number, Finalizados: number }> = {}
    filteredBase.forEach(p => {
      const d   = new Date(p.dataEntrada)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      if (!byMonth[key]) byMonth[key] = { name: label, 'Em Andamento': 0, Finalizados: 0 }
      byMonth[key]['Em Andamento']++
      if (p.statusDaIA === 'concluido') byMonth[key].Finalizados++
    })
    const rows = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
    return rows.length > 0 ? rows : [{ name: '—', 'Em Andamento': 0, Finalizados: 0 }]
  }, [filteredBase])

  // ─── Dados: Processos por UF ─────────────────────────────────────────────
  const ufData = useMemo(() => {
    const byUf: Record<string, { name: string; Processos: number; Finalizados: number }> = {}
    filteredBase.forEach(p => {
      if (!byUf[p.uf]) byUf[p.uf] = { name: p.uf, Processos: 0, Finalizados: 0 }
      byUf[p.uf].Processos++
      if (p.statusDaIA === 'concluido') byUf[p.uf].Finalizados++
    })
    return Object.values(byUf).sort((a, b) => b.Processos - a.Processos)
  }, [filteredBase])

  // ─── Dados: Economia IA ───────────────────────────────────────────────────
  const economiaData = useMemo(() => {
    const totalRisco    = filteredBase.reduce((acc, p) => acc + p.valorCausa, 0)
    const totalCondenacao = filteredBase.reduce((acc, p) => acc + p.valorCondenacao, 0)
    const totalAcordoIA = filteredBase.reduce((acc, p) => acc + (p.valorAcordoSugerido ?? 0), 0)
    const economiaGerada = totalRisco - totalCondenacao
    return [{
      name: 'Análise',
      'Valor em Risco':    totalRisco,
      'Condenação Total':  totalCondenacao,
      'Acordo Sugerido IA': totalAcordoIA,
      'Economia Gerada':   economiaGerada,
    }]
  }, [filteredBase])

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val)

  const formatCurrencyCompact = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0, notation: 'compact' }).format(val)

  const chartOptions: { id: ChartType; label: string }[] = [
    ...(userRole === 'banco' ? [{ id: 'acuracia' as ChartType, label: 'Acurácia IA vs Advogado' }] : []),
    { id: 'mes-a-mes', label: 'Processos Mês a Mês' },
    { id: 'economia',  label: 'Economia com IA' },
    { id: 'por-uf',    label: 'Processos por UF' },
  ]

  const hasFilter = filterMonth || filterDay

  const filterLabel = filterDay
    ? new Date(filterDay + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : filterMonth
      ? new Date(filterMonth + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : null

  return (
    <DashboardLayout pageTitle={`Dashboard · ${userRole === 'banco' ? 'Visão Executiva (Banco)' : 'Meu Painel (Advogado)'}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', transition: 'all 0.3s ease' }}>

        {/* ─── MÉTRICAS PRINCIPAIS ─── */}
        <section>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '16px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            Visão Geral e Risco
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <KpiCard
              label="Aguardando Julgamento"
              value={String(aguardandoJulgamento)}
              icon={<Clock size={18} />}
              subtitle="Processos aguardando decisão do juiz"
            />
            <KpiCard
              label="Para Avaliar"
              value={String(paraAvaliar)}
              icon={<Activity size={18} />}
              subtitle="Processos na fila aguardando avaliação do advogado"
            />
            <KpiCard
              label="Analisados pelo Advogado (mês)"
              value={String(analisadosNoMes)}
              icon={<UserCheck size={18} />}
              subtitle="Processos com decisão registrada em abril/2026"
            />
            <KpiCard
              label="Valor Economizado dos Processos"
              value={formatCurrency(economizadoMotor)}
              icon={<Zap size={18} />}
              subtitle="Economia gerada pela sugestão de acordo da IA"
            />
          </div>
        </section>


        {/* ─── GRÁFICOS ANALÍTICOS (SELECIONÁVEIS) ─── */}
        <section style={{ animation: 'fadeIn 0.4s ease-out' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '16px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            Gráficos Analíticos{userRole === 'banco' ? ' — Banco UFMG' : ''}
          </h2>

          {/* ── Barra de controles ── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '12px',
            padding: '12px 16px',
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-card)',
          }}>

            {/* Seletor de gráfico */}
            <div style={{ display: 'flex', gap: '6px', flex: 1, flexWrap: 'wrap' }}>
              {chartOptions.map(opt => {
                const active = selectedChart === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedChart(opt.id)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: active ? 'var(--color-primary-600)' : 'var(--color-border)',
                      backgroundColor: active ? 'var(--color-primary-600)' : 'transparent',
                      color: active ? '#fff' : 'var(--color-text-secondary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {/* Filtros de data */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Calendar size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  Mês:
                </label>
                <input
                  type="month"
                  value={filterMonth}
                  onChange={e => { setFilterMonth(e.target.value); setFilterDay('') }}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  Dia:
                </label>
                <input
                  type="date"
                  value={filterDay}
                  onChange={e => {
                    setFilterDay(e.target.value)
                    if (e.target.value) setFilterMonth(e.target.value.slice(0, 7))
                  }}
                  style={inputStyle}
                />
              </div>

              {hasFilter && (
                <button
                  onClick={() => { setFilterMonth(''); setFilterDay('') }}
                  title="Limpar filtro de data"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '3px',
                    padding: '4px 8px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '5px',
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <X size={11} />
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Badge de filtro ativo */}
          {filterLabel && (
            <p style={{ margin: '0 0 10px', fontSize: '11px', color: 'var(--color-primary-600)', fontWeight: 500 }}>
              Exibindo dados de: {filterLabel} · {filteredBase.length} processo(s)
            </p>
          )}

          {/* ── Gráfico selecionado ── */}
          {selectedChart === 'acuracia' && userRole === 'banco' && (
            <ChartCardBase
              title="Acurácia — Sugestão (IA) vs Acato do Advogado"
              subtitle="Exclusivo Banco UFMG · Aderência entre a recomendação da IA e a decisão tomada pelo advogado"
              data={acuraciaData}
              xAxisKey="name"
              series={[
                { dataKey: 'Acatada',      label: 'Sugestão Acatada', color: COLOR_SUCCESS },
                { dataKey: 'Não Acatada',  label: 'Não Acatada',      color: COLOR_DANGER  },
              ]}
            />
          )}

          {selectedChart === 'mes-a-mes' && (
            <ChartCardBase
              title="Processos — Mês a Mês"
              subtitle="Volume de processos em andamento e finalizados por período"
              data={mesMesData}
              xAxisKey="name"
              series={[
                { dataKey: 'Em Andamento', label: 'Em Andamento', color: COLOR_BLUE    },
                { dataKey: 'Finalizados',  label: 'Finalizados',  color: COLOR_SUCCESS },
              ]}
            />
          )}

          {selectedChart === 'economia' && (
            <ChartCardBase
              title="Economia com IA — Análise Financeira"
              subtitle="Valor em risco total, acordo sugerido pela IA, condenação real e economia gerada na carteira"
              data={economiaData}
              xAxisKey="name"
              formatValue={formatCurrencyCompact}
              series={[
                { dataKey: 'Valor em Risco',     label: 'Valor em Risco',     color: COLOR_AMBER  },
                { dataKey: 'Condenação Total',   label: 'Condenação Total',   color: COLOR_DANGER  },
                { dataKey: 'Acordo Sugerido IA', label: 'Acordo Sugerido IA', color: COLOR_PURPLE  },
                { dataKey: 'Economia Gerada',    label: 'Economia Gerada',    color: COLOR_SUCCESS },
              ]}
            />
          )}

          {selectedChart === 'por-uf' && (
            <ChartCardBase
              title="Processos por UF"
              subtitle="Distribuição de processos por Unidade Federativa — total e finalizados"
              data={ufData}
              xAxisKey="name"
              series={[
                { dataKey: 'Processos',   label: 'Total',       color: COLOR_BLUE    },
                { dataKey: 'Finalizados', label: 'Finalizados', color: COLOR_SUCCESS },
              ]}
            />
          )}
        </section>

        {/* ─── DATATABLE ─── */}
        <section>
          <DataTableBase
            columns={COLUMNS}
            data={processosAtuais as unknown as Record<string, unknown>[]}
            caption={userRole === 'banco' ? 'Últimos Registros (Global)' : 'Meus Últimos Processos'}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={(col, dir) => {
              setSortColumn(col)
              setSortDirection(dir)
            }}
          />
        </section>

      </div>
    </DashboardLayout>
  )
}