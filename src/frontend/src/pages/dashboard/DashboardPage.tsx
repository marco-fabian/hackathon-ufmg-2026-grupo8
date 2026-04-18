import { useState, useMemo, useEffect } from 'react'
import { Clock, Activity, UserCheck, Zap } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { ChartCardBase } from '@/components/data/ChartCardBase'
import { useView } from '@/context/ViewContext'
import { mockProcessos } from '@/data/mockData'

interface ProcessoBase {
  numeroCaso: string
  uf: string
  subAssunto: string
  resultadoMacro: string
  resultadoMicro: string
  valorCausa: number
  valorCondenacao: number
  decisaoAdvogado: string
}

// ─── LÓGICA DE DADOS ──────────────────────────────────────────────────────────


const COLOR_ORANGE       = '#FFAE35'
const COLOR_BLACK        = '#1A1A1A'
const COLOR_ORANGE_LIGHT = '#FFD07A'

// ─── Dados estáticos de risco (agregados de banco_treino.csv — 60k processos) ─
const RISCO_POR_SUBASSUNTO = [
  { name: 'Golpe',    'Chance de Perda (%)': 38 },
  { name: 'Genérico', 'Chance de Perda (%)': 22 },
]

const DEFESA_POR_DOCUMENTO = [
  { name: 'Contrato',      'Com Documento': 75, 'Sem Documento': 55 },
  { name: 'Laudo',         'Com Documento': 74, 'Sem Documento': 55 },
  { name: 'Extrato',       'Com Documento': 73, 'Sem Documento': 58 },
  { name: 'Comprovante',   'Com Documento': 72, 'Sem Documento': 60 },
  { name: 'Demonstrativo', 'Com Documento': 72, 'Sem Documento': 62 },
  { name: 'Dossiê',        'Com Documento': 71, 'Sem Documento': 64 },
]

const VALOR_PEDIDO_VS_PAGO = [
  { name: '< R$10k',       'Valor Pedido': 7500,  'Valor Pago': 5000  },
  { name: 'R$10k – R$18k', 'Valor Pedido': 14000, 'Valor Pago': 9500  },
  { name: '> R$18k',       'Valor Pedido': 22000, 'Valor Pago': 15000 },
]


const PERDA_POR_UF = [
  { name: 'AP', 'Taxa de Perda (%)': 48.1 },
  { name: 'AM', 'Taxa de Perda (%)': 47.8 },
  { name: 'GO', 'Taxa de Perda (%)': 38.3 },
  { name: 'RS', 'Taxa de Perda (%)': 37.4 },
  { name: 'BA', 'Taxa de Perda (%)': 35.0 },
  { name: 'RJ', 'Taxa de Perda (%)': 34.6 },
  { name: 'PA', 'Taxa de Perda (%)': 33.8 },
  { name: 'ES', 'Taxa de Perda (%)': 33.5 },
  { name: 'DF', 'Taxa de Perda (%)': 32.7 },
  { name: 'MA', 'Taxa de Perda (%)': 32.1 },
  { name: 'MT', 'Taxa de Perda (%)': 31.5 },
  { name: 'RR', 'Taxa de Perda (%)': 31.2 },
  { name: 'SP', 'Taxa de Perda (%)': 31.0 },
  { name: 'AL', 'Taxa de Perda (%)': 31.0 },
  { name: 'RO', 'Taxa de Perda (%)': 30.8 },
  { name: 'TO', 'Taxa de Perda (%)': 30.5 },
  { name: 'MS', 'Taxa de Perda (%)': 30.2 },
  { name: 'SE', 'Taxa de Perda (%)': 29.7 },
  { name: 'AC', 'Taxa de Perda (%)': 29.5 },
  { name: 'PB', 'Taxa de Perda (%)': 29.1 },
  { name: 'CE', 'Taxa de Perda (%)': 28.7 },
  { name: 'PE', 'Taxa de Perda (%)': 28.4 },
  { name: 'RN', 'Taxa de Perda (%)': 28.2 },
  { name: 'MG', 'Taxa de Perda (%)': 27.8 },
  { name: 'PI', 'Taxa de Perda (%)': 27.6 },
  { name: 'PR', 'Taxa de Perda (%)': 26.9 },
  { name: 'SC', 'Taxa de Perda (%)': 25.4 },
]

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = (max - min) || 1
  const W = 56, H = 22
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastY = H - ((data[data.length - 1] - min) / range) * (H - 4) - 2
  return (
    <svg width={W} height={H} style={{ overflow: 'visible', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.65} />
      <circle cx={W} cy={lastY} r="2.5" fill={color} />
    </svg>
  )
}

interface KpiCardProps {
  label: string
  value: string
  icon: React.ReactNode
  subtitle?: string
  accent?: string
  sparkline?: number[]
  trend?: { pct: number; dir: 'up' | 'down'; good: boolean }
}

function KpiCard({ label, value, icon, subtitle, accent = COLOR_ORANGE, sparkline, trend }: KpiCardProps) {
  const trendColor = trend ? (trend.good ? '#10B981' : '#EF4444') : '#6B7280'
  const trendArrow = trend ? (trend.dir === 'up' ? '▲' : '▼') : '—'
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
      borderLeft: `3px solid ${accent}`,
      borderRadius: '10px',
      padding: '20px',
      boxShadow: 'var(--shadow-card)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          flex: 1, fontSize: '11px', fontWeight: 600,
          color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {label}
        </span>
        <div style={{
          width: '32px', height: '32px', borderRadius: '8px',
          backgroundColor: `${accent}1A`, display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: accent,
        }}>
          {icon}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: '26px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {value}
          </p>
          {subtitle && (
            <div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
              {subtitle}
            </div>
          )}
        </div>
        {sparkline && <Sparkline data={sparkline} color={accent} />}
      </div>
      {trend && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '3px',
          fontSize: '11px', fontWeight: 600, color: trendColor,
          paddingTop: '6px', borderTop: '1px solid var(--color-border)',
        }}>
          <span>{trendArrow}</span>
          <span>{trend.pct}% vs mês anterior</span>
        </div>
      )}
    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { userRole } = useView()
  const [selectedChart, setSelectedChart] = useState<'subassunto' | 'documentos' | 'valores' | 'estados' | 'processos' | 'ticket'>('subassunto')
  const [baseProcessos, setBaseProcessos] = useState<ProcessoBase[]>([])

  useEffect(() => {
    fetch('/processos.json')
      .then(r => r.json())
      .then((data: Omit<ProcessoBase, 'decisaoAdvogado'>[]) => {
        setBaseProcessos(data.map(p => ({
          ...p,
          decisaoAdvogado: p.resultadoMacro === 'Não Êxito' ? 'Acordo' : 'Defesa',
        })))
      })
  }, [])

  const ADVOGADO_LOGADO = 'Dr. Rafael Silva'

  const processosAtuais = useMemo(() =>
    userRole === 'advogado'
      ? mockProcessos.filter(p => p.advogadoResponsavel === ADVOGADO_LOGADO)
      : mockProcessos
  , [userRole])

  const processosPorUF = useMemo(() => {
    const counts: Record<string, number> = {}
    baseProcessos.forEach(p => { counts[p.uf] = (counts[p.uf] ?? 0) + 1 })
    return Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, 'Processos': count }))
  }, [baseProcessos])

  const ticketMedioPorUF = useMemo(() => {
    const sums: Record<string, number> = {}
    const counts: Record<string, number> = {}
    baseProcessos.forEach(p => {
      if (p.valorCondenacao > 0) {
        sums[p.uf]   = (sums[p.uf]   ?? 0) + p.valorCondenacao
        counts[p.uf] = (counts[p.uf] ?? 0) + 1
      }
    })
    return Object.entries(sums)
      .map(([name, sum]) => ({ name, 'Ticket Médio (R$)': Math.round(sum / counts[name]) }))
      .sort((a, b) => b['Ticket Médio (R$)'] - a['Ticket Médio (R$)'])
  }, [baseProcessos])

  // ─── KPI principais ──────────────────────────────────────────────────────
  const base = userRole === 'banco' ? mockProcessos : processosAtuais
  const CURRENT_MONTH = '2026-04'

  const aguardandoJulgamento = base.filter(p => p.statusDaIA === 'aguardando_subsidios').length
  const paraAvaliar          = base.filter(p => p.decisaoAdvogado === 'pendente').length
  const analisadosNoMes      = base.filter(
    p => p.decisaoAdvogado !== 'pendente' && p.dataEntrada.startsWith(CURRENT_MONTH)
  ).length
  // Valor real: backtest Balanceada (economia_por_processo R$ 1.751,13 × 60.000)
  const economizadoMotor = 105_067_680

  const formatCurrencyCompact = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0, notation: 'compact' }).format(val)

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
              accent="#FFAE35"
              sparkline={[3, 2, 4, 2, aguardandoJulgamento]}
              trend={{ pct: 50, dir: 'down', good: true }}
            />
            <KpiCard
              label="Para Avaliar"
              value={String(paraAvaliar)}
              icon={<Activity size={18} />}
              subtitle="Processos na fila aguardando avaliação do advogado"
              accent="#6366F1"
              sparkline={[1, 2, 1, 1, paraAvaliar]}
            />
            <KpiCard
              label="Analisados pelo Advogado (mês)"
              value={String(analisadosNoMes)}
              icon={<UserCheck size={18} />}
              subtitle={`Processos com decisão registrada em ${new Date(CURRENT_MONTH + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`}
              accent="#8B5CF6"
              sparkline={[5, 4, 6, 3, analisadosNoMes]}
            />
            <KpiCard
              label="Valor Economizado dos Processos"
              value={formatCurrencyCompact(economizadoMotor)}
              icon={<Zap size={18} />}
              subtitle="Economia estimada pelo motor IA (política Balanceada · base 60k processos)"
              accent="#10B981"
              sparkline={[60_000_000, 72_000_000, 88_000_000, 98_000_000, economizadoMotor]}
              trend={{ pct: 37.7, dir: 'up', good: true }}
            />
          </div>
        </section>


        {/* ─── GRÁFICOS ANALÍTICOS ─── */}
        <section>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '16px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            Gráficos Analíticos
          </h2>

          {/* ── Seletor de gráfico ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
            marginBottom: '12px', padding: '12px 16px',
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px', boxShadow: 'var(--shadow-card)',
          }}>
            {([
              { id: 'subassunto', label: 'Chance de Ganhar por Sub-assunto' },
              { id: 'documentos', label: 'Documentos e Chance de Defesa'    },
              { id: 'valores',    label: 'Valor Pedido vs Valor Pago'        },
              { id: 'estados',    label: 'Estados com Maior Risco'           },
              { id: 'processos',  label: 'Processos por Estado'               },
              { id: 'ticket',     label: 'Ticket Médio de Condenação por UF'  },
            ] as const).map(opt => {
              const active = selectedChart === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => setSelectedChart(opt.id)}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: '1px solid',
                    borderColor: active ? 'var(--color-primary-600)' : 'var(--color-border)',
                    backgroundColor: active ? 'var(--color-primary-600)' : 'transparent',
                    color: active ? '#fff' : 'var(--color-text-secondary)',
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s ease', whiteSpace: 'nowrap',
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>

          {/* ── Gráfico selecionado ── */}
          {selectedChart === 'subassunto' && (
            <ChartCardBase
              title="Chance de Ganhar a Ação por Tipo de Sub-assunto"
              subtitle="Probabilidade histórica de ganho por categoria de alegação (base 60k processos)"
              data={RISCO_POR_SUBASSUNTO}
              xAxisKey="name"
              series={[{ dataKey: 'Chance de Perda (%)', label: 'Chance de Perda (%)', color: COLOR_ORANGE }]}
              formatValue={(v) => `${v}%`}
            />
          )}
          {selectedChart === 'documentos' && (
            <ChartCardBase
              title="Documentos que Aumentam a Chance de Defesa"
              subtitle="% de processos ganhos com e sem cada documento presente"
              data={DEFESA_POR_DOCUMENTO}
              xAxisKey="name"
              series={[
                { dataKey: 'Com Documento', label: 'Com Documento', color: COLOR_ORANGE },
                { dataKey: 'Sem Documento', label: 'Sem Documento', color: COLOR_BLACK  },
              ]}
              formatValue={(v) => `${v}%`}
            />
          )}
          {selectedChart === 'valores' && (
            <ChartCardBase
              title="Valor Pedido vs Valor Pago pelo Banco"
              subtitle="Média do valor pedido vs valor pago nos processos perdidos, por faixa de risco"
              data={VALOR_PEDIDO_VS_PAGO}
              xAxisKey="name"
              series={[
                { dataKey: 'Valor Pedido', label: 'Valor Pedido', color: COLOR_ORANGE_LIGHT },
                { dataKey: 'Valor Pago',   label: 'Valor Pago',   color: COLOR_BLACK        },
              ]}
              formatValue={formatCurrencyCompact}
            />
          )}
          {selectedChart === 'estados' && (
            <ChartCardBase
              title="Estados onde o Banco Mais Perde na Justiça"
              subtitle="Taxa histórica de perda por UF, ordenada do maior para o menor risco (base 60k processos)"
              data={PERDA_POR_UF}
              xAxisKey="name"
              series={[{ dataKey: 'Taxa de Perda (%)', label: 'Taxa de Perda (%)', color: COLOR_ORANGE }]}
              formatValue={(v) => `${v}%`}
            />
          )}
          {selectedChart === 'processos' && (
            <ChartCardBase
              title="Processos por Estado"
              subtitle="Distribuição de processos recebidos por UF (base 60k processos)"
              data={processosPorUF}
              xAxisKey="name"
              series={[{ dataKey: 'Processos', label: 'Processos', color: COLOR_ORANGE }]}
              formatValue={(v) => `${v.toLocaleString('pt-BR')}`}
            />
          )}
          {selectedChart === 'ticket' && (
            <ChartCardBase
              title="Valor Médio de Condenação por UF"
              subtitle="Média do valor pago pelo banco nos processos perdidos, por estado — ordenado do maior para o menor"
              data={ticketMedioPorUF}
              xAxisKey="name"
              series={[{ dataKey: 'Ticket Médio (R$)', label: 'Ticket Médio (R$)', color: COLOR_ORANGE }]}
              formatValue={formatCurrencyCompact}
            />
          )}
        </section>

      </div>
    </DashboardLayout>
  )
}