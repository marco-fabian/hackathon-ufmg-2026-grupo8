import type { ReactNode } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent'

// ─── Types ────────────────────────────────────────────────────────────────
export interface ChartSeries {
  dataKey: string
  label: string
  color?: string
}

interface ChartCardBaseProps {
  title: string
  subtitle?: string
  data: Record<string, unknown>[]
  xAxisKey: string
  series: ChartSeries[]
  height?: number
  headerAction?: ReactNode
  isLoading?: boolean
  formatValue?: (value: number) => string
}

// ─── Default series colors (corporate palette) ────────────────────────────
const DEFAULT_COLORS = [
  '#2563EB', // primary-600
  '#16A34A', // success
  '#D97706', // warning
  '#DC2626', // danger
  '#7C3AED', // violet
  '#0891B2', // cyan
]

// ─── Custom Tooltip ───────────────────────────────────────────────────────
interface TooltipEntry {
  dataKey?: string | number
  name?: string
  value?: ValueType
  color?: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  formatValue?: (v: number) => string
}

function CustomTooltip({ active, payload, label, formatValue }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '10px 14px',
        boxShadow: 'var(--shadow-modal)',
        fontSize: '12px',
      }}
    >
      <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: '6px' }}>
        {String(label ?? '')}
      </p>
      {payload.map((entry, idx) => (
        <div key={String(entry.dataKey ?? idx)} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: entry.color, display: 'inline-block' }} />
          <span style={{ color: 'var(--color-text-secondary)' }}>{entry.name}:</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {formatValue ? formatValue(entry.value as number) : String(entry.value ?? '')}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────
function ChartSkeleton({ height }: { height: number }) {
  return (
    <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '0 8px' }}>
      {[55, 80, 40, 70, 90, 60, 75].map((h, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${h}%`,
            backgroundColor: 'var(--color-bg-subtle)',
            borderRadius: '6px 6px 0 0',
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  )
}

// ─── ChartCardBase ────────────────────────────────────────────────────────
export function ChartCardBase({
  title,
  subtitle,
  data,
  xAxisKey,
  series,
  height = 280,
  headerAction,
  isLoading = false,
  formatValue,
}: ChartCardBaseProps) {
  return (
    <div
      style={{
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: '10px',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}
    >
      {/* Card Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '16px 20px 0',
          gap: '12px',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: '14px',
              color: 'var(--color-text-primary)',
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
        {headerAction && <div>{headerAction}</div>}
      </div>

      {/* Chart Area */}
      <div style={{ padding: '16px 8px 12px' }}>
        {isLoading ? (
          <ChartSkeleton height={height} />
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid
                vertical={false}
                stroke="var(--color-border)"
                strokeDasharray="4 4"
              />
              <XAxis
                dataKey={xAxisKey}
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
                axisLine={false}
                tickLine={false}
                dy={4}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
                axisLine={false}
                tickLine={false}
                dx={-4}
                tickFormatter={formatValue}
              />
              <Tooltip
                content={({ active, payload, label }) => (
                  <CustomTooltip
                    active={active}
                    payload={payload as unknown as TooltipEntry[] | undefined}
                    label={label}
                    formatValue={formatValue}
                  />
                )}
                cursor={{ fill: 'var(--color-bg-subtle)', radius: 4 }}
              />
              {series.length > 1 && (
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '12px', color: 'var(--color-text-secondary)' }}
                />
              )}
              {series.map((s, i) => (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  name={s.label}
                  fill={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
