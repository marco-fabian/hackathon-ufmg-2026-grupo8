import type { ReactNode } from 'react'
import {
  LayoutDashboard,
  Scale,
  Landmark,
  FileText,
  Users,
  BarChart3,
  Settings,
  Bell,
  ChevronRight,
  LogOut,
} from 'lucide-react'

// ─── Navigation Item Type ─────────────────────────────────────────────────
interface NavItem {
  icon: ReactNode
  label: string
  href: string
  active?: boolean
  badge?: number
}

const NAV_ITEMS: NavItem[] = [
  { icon: <LayoutDashboard size={18} />, label: 'Dashboard',   href: '#', active: true },
  { icon: <Scale            size={18} />, label: 'Processos',   href: '#', badge: 4 },
  { icon: <Landmark         size={18} />, label: 'Financeiro',  href: '#' },
  { icon: <FileText         size={18} />, label: 'Documentos',  href: '#' },
  { icon: <Users            size={18} />, label: 'Clientes',    href: '#' },
  { icon: <BarChart3        size={18} />, label: 'Relatórios',  href: '#' },
]

// ─── Sidebar ──────────────────────────────────────────────────────────────
function Sidebar() {
  return (
    <aside
      style={{ backgroundColor: 'var(--color-sidebar)', width: '240px', minHeight: '100dvh' }}
      className="flex flex-col flex-shrink-0 select-none"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <div
          style={{ backgroundColor: 'var(--color-primary-600)' }}
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        >
          <Scale size={16} color="#fff" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm tracking-wide leading-none">EnterOS</p>
          <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-0.5">Jurídico &amp; Banking</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p style={{ color: 'var(--color-text-muted)' }} className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-widest">
          Principal
        </p>
        {NAV_ITEMS.map((item) => (
          <a
            key={item.label}
            href={item.href}
            style={{
              backgroundColor: item.active ? 'var(--color-sidebar-active)' : undefined,
              color: item.active ? '#fff' : 'var(--color-text-muted)',
            }}
            className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium group hover:bg-white/10 hover:text-white transition-all"
          >
            <span className="flex items-center gap-3">
              <span style={{ opacity: item.active ? 1 : 0.7 }} className="group-hover:opacity-100 transition-opacity">
                {item.icon}
              </span>
              {item.label}
            </span>
            {item.badge !== undefined ? (
              <span
                style={{ backgroundColor: 'var(--color-primary-600)', color: '#fff' }}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
              >
                {item.badge}
              </span>
            ) : item.active ? (
              <ChevronRight size={14} style={{ color: '#fff', opacity: 0.5 }} />
            ) : null}
          </a>
        ))}

        <div className="pt-4">
          <p style={{ color: 'var(--color-text-muted)' }} className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest">
            Sistema
          </p>
          <a
            href="#"
            style={{ color: 'var(--color-text-muted)' }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 hover:text-white transition-all"
          >
            <Settings size={18} style={{ opacity: 0.7 }} />
            Configurações
          </a>
        </div>
      </nav>

      {/* User footer */}
      <div className="px-3 pb-4">
        <div className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/10 cursor-pointer transition-all group">
          <div
            style={{ backgroundColor: 'var(--color-primary-700)' }}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          >
            <span className="text-white text-xs font-bold">DR</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">Dr. Rafael Silva</p>
            <p style={{ color: 'var(--color-text-muted)' }} className="text-[10px] truncate">Sócio Sênior</p>
          </div>
          <LogOut size={14} style={{ color: 'var(--color-text-muted)', opacity: 0 }} className="group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>
      </div>
    </aside>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────
function Header({ title }: { title: string }) {
  return (
    <header
      style={{
        backgroundColor: 'var(--color-bg-card)',
        borderBottom: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-navbar)',
      }}
      className="flex items-center justify-between px-6 h-[60px] flex-shrink-0"
    >
      {/* Breadcrumb / Page title */}
      <div className="flex items-center gap-2">
        <h1 style={{ color: 'var(--color-text-primary)' }} className="text-sm font-semibold">
          {title}
        </h1>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Notification */}
        <button
          style={{
            backgroundColor: 'var(--color-bg-subtle)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          }}
          className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors"
          aria-label="Notificações"
          id="btn-notifications"
        >
          <Bell size={16} />
          <span
            style={{ backgroundColor: 'var(--color-primary-600)' }}
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
          />
        </button>

        {/* Date */}
        <span style={{ color: 'var(--color-text-muted)' }} className="text-xs hidden md:block">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
      </div>
    </header>
  )
}

// ─── Dashboard Layout ────────────────────────────────────────────────────
interface DashboardLayoutProps {
  children: ReactNode
  pageTitle?: string
}

export function DashboardLayout({ children, pageTitle = 'Dashboard' }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0" style={{ backgroundColor: 'var(--color-bg-base)' }}>
        <Header title={pageTitle} />

        {/* Content area */}
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-[1280px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
