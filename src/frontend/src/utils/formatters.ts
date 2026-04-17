/**
 * formatters.ts — Utility functions for display formatting in EnterOS.
 */

/** Format a number as Brazilian Real currency. */
export function formatBRL(value: number, compact = false): string {
  if (compact && value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(2).replace('.', ',')}M`
  }
  if (compact && value >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(1).replace('.', ',')}k`
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/** Format a date string to pt-BR locale. */
export function formatDate(date: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('pt-BR', opts ?? { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Capitalize the first letter of each word. */
export function titleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase())
}

/** Truncate a string to a given max length with ellipsis. */
export function truncate(str: string, max = 40): string {
  return str.length > max ? `${str.slice(0, max)}…` : str
}

/** Format a process number in the Brazilian standard pattern. */
export function formatProcessNumber(raw: string): string {
  // Pattern: NNNNNNN-DD.AAAA.J.TT.OOOO
  const clean = raw.replace(/\D/g, '')
  if (clean.length !== 20) return raw
  return `${clean.slice(0, 7)}-${clean.slice(7, 9)}.${clean.slice(9, 13)}.${clean[13]}.${clean.slice(14, 16)}.${clean.slice(16)}`
}
