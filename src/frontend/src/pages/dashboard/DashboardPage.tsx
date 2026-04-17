import { useState, useMemo } from 'react'
import { Scale, Landmark, FileText, AlertCircle, Clock } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DataTableBase, type ColumnDef, type SortDirection } from '@/components/data/DataTableBase'
import { ChartCardBase } from '@/components/data/ChartCardBase'
import { useView } from '@/context/ViewContext'
import { mockProcessos, type Processo } from '@/data/mockData'

// ─── LÓGICA DE DADOS (Processamento) ──────────────────────────────────────

// Exito vs Não Exito
function parseExito(resultadoMicro: string): 'Êxito' | 'Não Êxito' {
  const norm = resultadoMicro.toLowerCase()
  if (norm.includes('improcede') || norm.includes('extin') || norm.includes('acordo')) {
    return 'Êxito'
  }
  return 'Não Êxito'
}

// Aderência
function checkAderente(statusIA: string, decisaoAdv: string): 'Aderente' | 'Não Aderente' {
  // Conforme requisito explícito: comparar os dois status.
  return String(statusIA).toLowerCase() === String(decisaoAdv).toLowerCase()
    ? 'Aderente'
    : 'Não Aderente'
}

// Cores Padronizadas (Requisitos)
const COLOR_SUCCESS = '#10B981' // Verde
const COLOR_DANGER = '#EF4444'  // Vermelho

// ─── Componentes Complementares (KPI Card) ────────────────────────────────

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
        <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
        {subtitle && (
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Definição de Colunas da Tabela (Opcional, mas mantém coerência) ──────
const COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: 'numeroCaso', header: 'Nº Processo', sortable: true, width: '220px' },
  { key: 'uf', header: 'UF', width: '60px' },
  { key: 'resultadoMicro', header: 'Resultado (Base)', sortable: true },
  {
    key: 'decisaoAdvogado',
    header: 'Ação Atual',
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

// ─── Dashboard Page ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const { userRole } = useView()
  const [sortColumn, setSortColumn] = useState<string | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)

  // Advogado fixo pra fins de demonstração (como consta na Sidebar do DashboardLayout)
  const ADVOGADO_LOGADO = 'Dr. Rafael Silva'

  // Preparações de dados
  const processosAtuais = useMemo(() => {
    return userRole === 'advogado'
      ? mockProcessos.filter((p) => p.advogadoResponsavel === ADVOGADO_LOGADO)
      : mockProcessos
  }, [userRole])

  // 1. SEÇÃO TODOS: Métricas GERAIS
  const volumeTotal = typeof mockProcessos !== 'undefined' ? mockProcessos.length : 0
  const valorTotalRisco = mockProcessos.reduce((acc, p) => acc + p.valorCausa, 0)
  
  // 2. SEÇÃO BANCO: Gráfico de Aderência (Sistema vs Advogado)
  const aderenciaData = useMemo(() => {
    let aderente = 0
    let naoAderente = 0

    mockProcessos.forEach((p) => {
      if (checkAderente(p.statusDaIA, p.decisaoAdvogado) === 'Aderente') {
        aderente++
      } else {
        naoAderente++
      }
    })
    return [{ name: 'Comparativo IA x Adv', Aderente: aderente, 'Não Aderente': naoAderente }]
  }, [])

  // 2. SEÇÃO BANCO: Gráfico de Performance (Êxito vs Não Êxito - Geral)
  const performanceGeralData = useMemo(() => {
    let exito = 0
    let naoExito = 0

    mockProcessos.forEach((p) => {
      if (parseExito(p.resultadoMicro) === 'Êxito') exito++
      else naoExito++
    })
    return [{ name: 'Qualidade da Resolução', 'Êxito': exito, 'Não Êxito': naoExito }]
  }, [])

  // 3. SEÇÃO ADVOGADO: Gráfico de Performance (Meu Desempenho)
  const performanceAdvogadoData = useMemo(() => {
    let exito = 0
    let naoExito = 0

    processosAtuais.forEach((p) => {
      if (parseExito(p.resultadoMicro) === 'Êxito') exito++
      else naoExito++
    })
    return [{ name: 'Meus Processos', 'Êxito': exito, 'Não Êxito': naoExito }]
  }, [processosAtuais])

  // 3. SEÇÃO ADVOGADO: Cards Específicos
  const pendentesAdvogado = processosAtuais.filter((p) => p.decisaoAdvogado === 'pendente').length
  const economizadoAdvogado = processosAtuais
    .filter((p) => parseExito(p.resultadoMicro) === 'Êxito' || p.decisaoAdvogado === 'acordo')
    .reduce((acc, p) => acc + Math.max(0, p.valorCausa - p.valorCondenacao), 0)

  // Formatador
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val)

  return (
    <DashboardLayout pageTitle={`Dashboard · ${userRole === 'banco' ? 'Visão Executiva (Banco)' : 'Meu Painel (Advogado)'}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', transition: 'all 0.3s ease' }}>
        
        {/* ======================= SEÇÃO "TODOS" ======================= */}
        <section>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '16px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            Visão Geral e Risco
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            <KpiCard
              label="Volume Total (Banco)"
              value={String(volumeTotal)}
              icon={<Scale size={18} />}
              subtitle="Quantidade global de processos em trâmite"
            />
            <KpiCard
              label="Valor Total em Risco"
              value={formatCurrency(valorTotalRisco)}
              icon={<Landmark size={18} />}
              subtitle="Soma integral do valor de todas as causas"
            />
          </div>
        </section>

        {/* ======================= SEÇÃO "BANCO" ======================= */}
        {userRole === 'banco' && (
          <section style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '16px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              Insights Corporativos e Performance Jurídica
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              <ChartCardBase
                title="Sistema vs Advogados (Aderência)"
                subtitle="Status IA versus a decisão tomada pelo advogado"
                data={aderenciaData}
                xAxisKey="name"
                series={[
                  { dataKey: 'Aderente', label: 'Aderente (Aceito)', color: COLOR_SUCCESS },
                  { dataKey: 'Não Aderente', label: 'Não Aderente (Negado)', color: COLOR_DANGER },
                ]}
              />
              <ChartCardBase
                title="Performance Geral de Defesa"
                subtitle="Êxitos (Improcedência/Acordos) vs Não Êxitos"
                data={performanceGeralData}
                xAxisKey="name"
                series={[
                  { dataKey: 'Êxito', label: 'Êxito', color: COLOR_SUCCESS },
                  { dataKey: 'Não Êxito', label: 'Não Êxito', color: COLOR_DANGER },
                ]}
              />
            </div>
          </section>
        )}

        {/* ======================= SEÇÃO "ADVOGADO" ==================== */}
        {userRole === 'advogado' && (
          <section style={{ animation: 'fadeIn 0.4s ease-out' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '16px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              Minha Produtividade (Dr(a). Rafael Silva)
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <KpiCard
                  label="Processos Pendentes"
                  value={String(pendentesAdvogado)}
                  icon={<AlertCircle size={18} />}
                  subtitle="Aguardando a sua análise ou decisão"
                />
                <KpiCard
                  label="Valor Economizado (Acordos/Êxitos)"
                  value={formatCurrency(economizadoAdvogado)}
                  icon={<FileText size={18} />}
                  subtitle="Redução de passivo gerada (Valor Causa - Condenação)"
                />
              </div>

              <ChartCardBase
                title="Meu Desempenho Pessoal"
                subtitle="Proporção de resoluções favoráveis nos meus processos"
                data={performanceAdvogadoData}
                xAxisKey="name"
                series={[
                  { dataKey: 'Êxito', label: 'Êxito', color: COLOR_SUCCESS },
                  { dataKey: 'Não Êxito', label: 'Não Êxito', color: COLOR_DANGER },
                ]}
              />
              
            </div>
          </section>
        )}

        {/* ==================== DATATABLE DE APOIO ===================== */}
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
