import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, X, ChevronLeft, ChevronRight } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────
export type SortDirection = 'asc' | 'desc' | null

export interface ColumnDef<T> {
  key: keyof T | string
  header: string
  sortable?: boolean
  filterType?: 'text' | 'select'
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
  pageSize?: number
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
        <td key={i} style={{ padding: '12px 16px' }}>
          <div
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
  pageSize = 50,
}: DataTableBaseProps<T>) {

  const [filters, setFilters] = useState<Record<string, string>>({})
  const [page, setPage]       = useState(0)

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

  function setFilter(key: string, value: string) {
    setPage(0)
    setFilters(prev => value ? { ...prev, [key]: value } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)))
  }

  const hasAnyFilter = Object.keys(filters).length > 0

  const filteredData = useMemo(() => data.filter(row =>
    columns.every(col => {
      const colKey = String(col.key)
      const term = filters[colKey]
      if (!term) return true
      const rawValue = row[colKey]
      return String(rawValue ?? '').toLowerCase().includes(term.toLowerCase())
    })
  ), [data, filters, columns])

  const totalPages  = Math.max(1, Math.ceil(filteredData.length / pageSize))
  const currentPage = Math.min(page, totalPages - 1)
  const pageData    = filteredData.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

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
      {/* Caption + clear filters */}
      {caption && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <span style={{
            color: 'var(--color-text-secondary)',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {caption}
            <span style={{ marginLeft: '8px', color: 'var(--color-primary-600)', fontWeight: 500 }}>
              · {filteredData.length.toLocaleString('pt-BR')} registro(s)
            </span>
          </span>
          {hasAnyFilter && (
            <button
              onClick={() => setFilters({})}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px',
                border: '1px solid var(--color-border)',
                borderRadius: '5px',
                fontSize: '11px',
                color: 'var(--color-text-muted)',
                backgroundColor: 'transparent',
                cursor: 'pointer',
              }}
            >
              <X size={11} />
              Limpar filtros
            </button>
          )}
        </div>
      )}

      <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>

          {/* Table HEAD */}
          <thead
            style={{
              backgroundColor: 'var(--color-bg-subtle)',
              position: stickyHeader ? 'sticky' : undefined,
              top: stickyHeader ? 0 : undefined,
              zIndex: stickyHeader ? 1 : undefined,
            }}
          >
            {/* Column labels row */}
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {columns.map((col) => {
                const colKey = String(col.key)
                const isActive = sortColumn === colKey
                return (
                  <th
                    key={colKey}
                    style={{
                      padding: '10px 16px 6px',
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

            {/* Filter inputs row */}
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              {columns.map((col) => {
                const colKey = String(col.key)
                const val = filters[colKey] ?? ''
                const isSelect = col.filterType === 'select'
                const uniqueOptions = isSelect
                  ? Array.from(new Set(data.map(row => String(row[colKey] ?? '')))).filter(Boolean).sort()
                  : []
                return (
                  <th key={colKey} style={{ padding: '4px 8px 8px' }}>
                    {isSelect ? (
                      <select
                        value={val}
                        onChange={e => setFilter(colKey, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          border: `1px solid ${val ? 'var(--color-primary-400)' : 'var(--color-border)'}`,
                          borderRadius: '5px',
                          fontSize: '11px',
                          backgroundColor: val ? 'var(--color-primary-50)' : 'var(--color-bg-card)',
                          color: val ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                          outline: 'none',
                          fontFamily: 'Inter, sans-serif',
                          cursor: 'pointer',
                          boxSizing: 'border-box',
                          transition: 'border-color 0.15s, background-color 0.15s',
                        }}
                      >
                        <option value="">Todos</option>
                        {uniqueOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Search
                          size={11}
                          style={{
                            position: 'absolute', left: '6px',
                            color: val ? 'var(--color-primary-600)' : 'var(--color-text-muted)',
                            pointerEvents: 'none',
                            flexShrink: 0,
                          }}
                        />
                        <input
                          value={val}
                          onChange={e => setFilter(colKey, e.target.value)}
                          placeholder="Filtrar…"
                          style={{
                            width: '100%',
                            paddingLeft: '22px',
                            paddingRight: val ? '22px' : '6px',
                            paddingTop: '4px',
                            paddingBottom: '4px',
                            border: `1px solid ${val ? 'var(--color-primary-400)' : 'var(--color-border)'}`,
                            borderRadius: '5px',
                            fontSize: '11px',
                            backgroundColor: val ? 'var(--color-primary-50)' : 'var(--color-bg-card)',
                            color: 'var(--color-text-primary)',
                            outline: 'none',
                            fontFamily: 'Inter, sans-serif',
                            boxSizing: 'border-box',
                            transition: 'border-color 0.15s, background-color 0.15s',
                          }}
                        />
                        {val && (
                          <button
                            onClick={() => setFilter(colKey, '')}
                            style={{
                              position: 'absolute', right: '5px',
                              display: 'flex', alignItems: 'center',
                              background: 'none', border: 'none',
                              cursor: 'pointer', padding: 0,
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    )}
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
            ) : filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--color-text-muted)' }}
                >
                  {hasAnyFilter ? 'Nenhum resultado para os filtros aplicados.' : emptyMessage}
                </td>
              </tr>
            ) : (
              pageData.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  style={{
                    borderBottom: rowIdx < pageData.length - 1 ? '1px solid var(--color-border)' : undefined,
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
          borderTop: '1px solid var(--color-border)',
          fontSize: '12px', color: 'var(--color-text-secondary)',
        }}>
          <span>
            Página {currentPage + 1} de {totalPages.toLocaleString('pt-BR')}
            {' '}·{' '}
            {(currentPage * pageSize + 1).toLocaleString('pt-BR')}–{Math.min((currentPage + 1) * pageSize, filteredData.length).toLocaleString('pt-BR')} de {filteredData.length.toLocaleString('pt-BR')}
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setPage(0)}
              disabled={currentPage === 0}
              style={{ padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: '5px', background: 'transparent', cursor: currentPage === 0 ? 'default' : 'pointer', opacity: currentPage === 0 ? 0.4 : 1, fontSize: '11px', color: 'var(--color-text-secondary)' }}
            >
              «
            </button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              style={{ padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: '5px', background: 'transparent', cursor: currentPage === 0 ? 'default' : 'pointer', opacity: currentPage === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage === totalPages - 1}
              style={{ padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: '5px', background: 'transparent', cursor: currentPage === totalPages - 1 ? 'default' : 'pointer', opacity: currentPage === totalPages - 1 ? 0.4 : 1, display: 'flex', alignItems: 'center' }}
            >
              <ChevronRight size={13} />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={currentPage === totalPages - 1}
              style={{ padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: '5px', background: 'transparent', cursor: currentPage === totalPages - 1 ? 'default' : 'pointer', opacity: currentPage === totalPages - 1 ? 0.4 : 1, fontSize: '11px', color: 'var(--color-text-secondary)' }}
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
