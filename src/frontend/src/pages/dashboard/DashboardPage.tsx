import { useState } from 'react'
import { TrendingUp, TrendingDown, Scale, Landmark, FileText, Clock } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DataTableBase, type ColumnDef, type SortDirection } from '@/components/data/DataTableBase'
import { ChartCardBase } from '@/components/data/ChartCardBase'

// ─── Mock Data ────────────────────────────────────────────────────────────
const CHART_DATA = [
  { mes: 'Jan', acordos: 12, processos: 28, receita: 142 },
  { mes: 'Fev', acordos: 18, processos: 34, receita: 198 },
  { mes: 'Mar', acordos: 9,  processos: 22, receita: 113 },
  { mes: 'Abr', acordos: 23, processos: 41, receita: 267 },
  { mes: 'Mai', acordos: 15, processos: 30, receita: 185 },
  { mes: 'Jun', acordos: 31, processos: 55, receita: 342 },
  { mes: 'Jul', acordos: 27, processos: 48, receita: 298 },
]

type StatusType = 'Ativo' | 'Em Andamento' | 'Encerrado' | 'Urgente'

interface Process {
  id: string
  numero: string
  cliente: string
  tipo: string
  status: StatusType
  valor: string
  prazo: string
}

const TABLE_DATA: Process[] = [
  { id: '1', numero: '0012345-67.2024', cliente: 'Banco Alfa S.A.',      tipo: 'Cível',      status: 'Ativo',        valor: 'R$ 1.200.000',  prazo: '15/05/2025' },
  { id: '2', numero: '0098765-43.2023', cliente: 'Construtora Beta',    tipo: 'Trabalhista', status: 'Em Andamento', valor: 'R$ 340.000',    prazo: '03/06/2025' },
  { id: '3', numero: '0011223-55.2024', cliente: 'Fundo Capital XP',    tipo: 'Tributário',  status: 'Urgente',      valor: 'R$ 8.500.000',  prazo: '30/04/2025' },
  { id: '4', numero: '0054321-98.2022', cliente: 'Holding Delta Ltda.', tipo: 'Societário',  status: 'Encerrado',    valor: 'R$ 2.100.000',  prazo: '—' },
  { id: '5', numero: '0078901-12.2024', cliente: 'Seguradora Omega',    tipo: 'Cível',       status: 'Ativo',        valor: 'R$ 520.000',    prazo: '22/07/2025' },
]

// ─── Status Badge ─────────────────────────────────────────────────────────
const STATUS_STYLES: Record<StatusType, { bg: string; text: string }> = {
  'Ativo':        { bg: 'var(--color-info-bg)',    text: 'var(--color-info-text)' },
  'Em Andamento': { bg: 'var(--color-warning-bg)', text: 'var(--color-warning-text)' },
  'Encerrado':    { bg: 'var(--color-bg-subtle)',  text: 'var(--color-text-secondary)' },
  'Urgente':      { bg: 'var(--color-danger-bg)',  text: 'var(--color-danger-text)' },
}

function StatusBadge({ status }: { status: StatusType }) {
  const style = STATUS_STYLES[status]
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      backgroundColor: style.bg,
      color: style.text,
      letterSpacing: '0.02em',
    }}>
      {status}
    </span>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string
  value: string
  change: string
  isPositive: boolean
  icon: React.ReactNode
}

function KpiCard({ label, value, change, isPositive, icon }: KpiCardProps) {
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
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary-600)' }}>
          {icon}
        </div>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
          {value}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
          {isPositive
            ? <TrendingUp size={12} style={{ color: 'var(--color-success)' }} />
            : <TrendingDown size={12} style={{ color: 'var(--color-danger)' }} />}
          <span style={{ fontSize: '11px', fontWeight: 500, color: isPositive ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {change}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>vs. mês anterior</span>
        </div>
      </div>
    </div>
  )
}

// ─── Columns definition ───────────────────────────────────────────────────
const COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: 'numero',  header: 'Nº Processo',  sortable: true,  width: '200px' },
  { key: 'cliente', header: 'Cliente',       sortable: true },
  { key: 'tipo',    header: 'Tipo',          sortable: true,  width: '110px' },
  {
    key: 'status',
    header: 'Status',
    width: '130px',
    render: (val) => <StatusBadge status={val as StatusType} />,
  },
  { key: 'valor',   header: 'Valor em Causa', sortable: true, align: 'right', width: '140px' },
  {
    key: 'prazo',
    header: 'Prazo',
    align: 'right',
    width: '110px',
    render: (val) => (
      <span style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
        <Clock size={11} />
        {String(val)}
      </span>
    ),
  },
]

// ─── Dashboard Page ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const [sortColumn, setSortColumn] = useState<string | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)

  function handleSort(col: string, dir: SortDirection) {
    setSortColumn(col)
    setSortDirection(dir)
  }

  return (
    <DashboardLayout pageTitle="Dashboard · Visão Geral">
      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <KpiCard label="Processos Ativos"  value="127"          change="+12%"    isPositive icon={<Scale    size={16} />} />
        <KpiCard label="Acordos no Mês"    value="31"           change="+41%"    isPositive icon={<FileText size={16} />} />
        <KpiCard label="Receita Acumulada" value="R$ 1,34M"     change="+8.2%"   isPositive icon={<Landmark size={16} />} />
        <KpiCard label="Taxa de Sucesso"   value="78.4%"        change="-2.1 pp" isPositive={false} icon={<TrendingUp size={16} />} />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <ChartCardBase
          title="Acordos vs. Processos"
          subtitle="Comparativo mensal do semestre"
          data={CHART_DATA}
          xAxisKey="mes"
          series={[
            { dataKey: 'acordos',   label: 'Acordos',   color: '#16A34A' },
            { dataKey: 'processos', label: 'Processos', color: '#2563EB' },
          ]}
        />
        <ChartCardBase
          title="Receita por Mês"
          subtitle="Honorários acumulados (R$ mil)"
          data={CHART_DATA}
          xAxisKey="mes"
          series={[{ dataKey: 'receita', label: 'Receita', color: '#2563EB' }]}
          formatValue={(v) => `${v}k`}
        />
      </div>

      {/* Data Table */}
      <DataTableBase
        columns={COLUMNS}
        data={TABLE_DATA as unknown as Record<string, unknown>[]}
        caption="Processos Recentes"
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
      />
    </DashboardLayout>
  )
}
