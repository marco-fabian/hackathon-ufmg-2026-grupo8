import type { ReactNode } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────
export type SortDirection = 'asc' | 'desc' | null

export interface ColumnDef<T> {
  key: keyof T | string
  header: string
  sortable?: boolean
  render?: (value: unknown, row: T) => ReactNode
  align?: 'left' | 'center' | 'right'
  width?: string
}

interface DataTableBaseProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  isLoading?: boolean
  emptyMessage?: string
  sortColumn?: string
  sortDirection?: SortDirection
  onSort?: (column: string, direction: SortDirection) => void
  caption?: string
  stickyHeader?: boolean
}

// ─── Sort Icon ─────────────────────────────────────────────────────────────
function SortIcon({ column, sortColumn, sortDirection }: {
  column: string
  sortColumn?: string
  sortDirection?: SortDirection
}) {
  if (column !== sortColumn || !sortDirection) {
    return <ChevronsUpDown size={12} style={{ color: 'var(--color-text-muted)', opacity: 0.6 }} />
  }
  return sortDirection === 'asc'
    ? <ChevronUp size={12} style={{ color: 'var(--color-primary-600)' }} />
    : <ChevronDown size={12} style={{ color: 'var(--color-primary-600)' }} />
}

// ─── Skeleton Row ──────────────────────────────────────────────────────────
function SkeletonRow({ colCount }: { colCount: number }) {
  return (
    <tr>
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            style={{ backgroundColor: 'var(--color-bg-subtle)', borderRadius: '4px' }}
            className="h-4 animate-pulse"
            style={{
              backgroundColor: 'var(--color-bg-subtle)',
              borderRadius: '4px',
              width: i === 0 ? '60%' : '80%',
              height: '14px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        </td>
      ))}
    </tr>
  )
}

// ─── DataTableBase ─────────────────────────────────────────────────────────
export function DataTableBase<T extends Record<string, unknown>>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'Nenhum registro encontrado.',
  sortColumn,
  sortDirection,
  onSort,
  caption,
  stickyHeader = false,
}: DataTableBaseProps<T>) {

  function handleSort(colKey: string, sortable?: boolean) {
    if (!sortable || !onSort) return
    if (sortColumn !== colKey) {
      onSort(colKey, 'asc')
    } else if (sortDirection === 'asc') {
      onSort(colKey, 'desc')
    } else {
      onSort(colKey, null)
    }
  }

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
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          {caption && (
            <caption style={{ captionSide: 'top', padding: '12px 16px', textAlign: 'left', color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {caption}
            </caption>
          )}

          {/* Table HEAD */}
          <thead
            style={{
              backgroundColor: 'var(--color-bg-subtle)',
              position: stickyHeader ? 'sticky' : undefined,
              top: stickyHeader ? 0 : undefined,
              zIndex: stickyHeader ? 1 : undefined,
            }}
          >
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {columns.map((col) => {
                const colKey = String(col.key)
                const isActive = sortColumn === colKey
                return (
                  <th
                    key={colKey}
                    style={{
                      padding: '10px 16px',
                      textAlign: col.align ?? 'left',
                      fontWeight: 600,
                      color: isActive ? 'var(--color-primary-700)' : 'var(--color-text-secondary)',
                      whiteSpace: 'nowrap',
                      width: col.width,
                      cursor: col.sortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      letterSpacing: '0.03em',
                    }}
                    onClick={() => handleSort(colKey, col.sortable)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {col.header}
                      {col.sortable && (
                        <SortIcon column={colKey} sortColumn={sortColumn} sortDirection={sortDirection} />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* Table BODY */}
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} colCount={columns.length} />
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--color-text-muted)' }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  style={{
                    borderBottom: rowIdx < data.length - 1 ? '1px solid var(--color-border)' : undefined,
                    transition: 'background-color 100ms ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-subtle)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                >
                  {columns.map((col) => {
                    const colKey = String(col.key)
                    const rawValue = row[colKey]
                    return (
                      <td
                        key={colKey}
                        style={{
                          padding: '12px 16px',
                          textAlign: col.align ?? 'left',
                          color: 'var(--color-text-primary)',
                          verticalAlign: 'middle',
                        }}
                      >
                        {col.render ? col.render(rawValue, row) : String(rawValue ?? '—')}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
