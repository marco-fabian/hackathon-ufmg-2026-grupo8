import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Scale,
  BrainCircuit,
  Bell,
  LogOut,
  Building2,
  Briefcase,
} from 'lucide-react'
import { useView } from '@/context/ViewContext'
import { mockStats } from '@/data/mockData'

// ─── Navigation Config ────────────────────────────────────────────────────────
interface NavItem {
  icon: ReactNode
  label: string
  href: string
  badge?: number
}

const NAV_ITEMS: NavItem[] = [
  { icon: <LayoutDashboard size={18} />, label: 'Dashboard',    href: '/' },
  { icon: <Scale            size={18} />, label: 'Processos Finalizados', href: '/processos' },
  { icon: <BrainCircuit     size={18} />, label: 'Casos em aberto',  href: '/analise' },
]

// ─── Role Switcher ─────────────────────────────────────────────────────────────
function RoleSwitcher() {
  const { userRole, toggleRole } = useView()
  const isAdvogado = userRole === 'advogado'

  return (
    <div className="px-3 pb-4">
      <p
        style={{ color: 'var(--color-text-muted)' }}
        className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest"
      >
        Modo de Visão
      </p>
      <button
        id="btn-role-switcher"
        onClick={toggleRole}
        aria-label={`Alternar para visão ${isAdvogado ? 'Banco' : 'Advogado'}`}
        style={{
          backgroundColor: 'rgba(234,88,12,0.15)',
          border: '1px solid rgba(234,88,12,0.35)',
        }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:opacity-90"
      >
        {/* Track */}
        <div
          style={{ backgroundColor: 'rgb(234,88,12)' }}
          className="relative w-9 h-5 rounded-full flex-shrink-0 transition-colors duration-300"
        >
          <span
            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-300"
            style={{ left: isAdvogado ? '2px' : '18px' }}
          />
        </div>

        {/* Label */}
        <span className="flex items-center gap-2 text-sm font-semibold">
          {isAdvogado ? (
            <>
              <Briefcase size={14} style={{ color: 'rgb(251,146,60)' }} />
              <span style={{ color: 'rgb(254,215,170)' }}>Visão Advogado</span>
            </>
          ) : (
            <>
              <Building2 size={14} style={{ color: 'rgb(251,146,60)' }} />
              <span style={{ color: 'rgb(254,215,170)' }}>Visão Banco</span>
            </>
          )}
        </span>
      </button>

      {/* Role indicator chip */}
      <p
        style={{ color: 'var(--color-text-muted)' }}
        className="text-[10px] text-center mt-2 opacity-60"
      >
        Clique para alternar
      </p>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar() {
  const location = useLocation()
  const { userRole } = useView()

  const filaBadge = userRole === 'advogado'
    ? mockStats.aguardandoAprovacaoAdvogadoCount
    : mockStats.aguardandoAprovacaoJuizCount

  const NAV_ITEMS: NavItem[] = [
    { icon: <LayoutDashboard size={18} />, label: 'Dashboard',         href: '/' },
    { icon: <Scale           size={18} />, label: 'Fila de Processos', href: '/processos', badge: filaBadge },
    { icon: <BrainCircuit    size={18} />, label: 'Análise de Caso',   href: '/analise' },
  ]

  const isActive = (href: string) =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href)

  return (
    <aside
      style={{ backgroundColor: 'var(--color-sidebar)', width: '240px' }}
      className="flex flex-col flex-shrink-0 select-none"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <img
          src="/logo-enter.svg"
          alt="Enter"
          style={{ width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0 }}
        />
        <div>
          <p className="text-white font-semibold text-sm tracking-wide leading-none">EnterOS</p>
          <p style={{ color: 'var(--color-text-muted)' }} className="text-xs mt-0.5">
            Jurídico &amp; Banking
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto min-h-0">
        <p
          style={{ color: 'var(--color-text-muted)' }}
          className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-widest"
        >
          Principal
        </p>

        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.label}
              to={item.href}
              id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              style={{
                backgroundColor: active ? 'var(--color-sidebar-active)' : undefined,
                color: active ? '#fff' : 'var(--color-text-muted)',
              }}
              className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium group hover:bg-white/10 hover:text-white transition-all"
            >
              <span className="flex items-center gap-3">
                <span
                  style={{ opacity: active ? 1 : 0.7 }}
                  className="group-hover:opacity-100 transition-opacity"
                >
                  {item.icon}
                </span>
                {item.label}
              </span>
              {item.badge !== undefined && !active && (
                <span
                  style={{ backgroundColor: 'var(--color-primary-600)', color: '#fff' }}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                >
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}

      </nav>

      {/* Role Switcher */}
      <RoleSwitcher />

      {/* User footer */}
      <div className="px-3 pb-4 border-t border-white/10 pt-3">
        <div className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/10 cursor-pointer transition-all group">
          <div
            style={{ backgroundColor: 'var(--color-primary-700)' }}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          >
            <span className="text-white text-xs font-bold">
              {userRole === 'advogado' ? 'DR' : 'BK'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">
              {userRole === 'advogado' ? 'Dr. Rafael Silva' : 'Banco EnterBank'}
            </p>
            <p style={{ color: 'var(--color-text-muted)' }} className="text-[10px] truncate">
              {userRole === 'advogado' ? 'Sócio Sênior' : 'Gestor de Risco'}
            </p>
          </div>
          <LogOut
            size={14}
            style={{ color: 'var(--color-text-muted)', opacity: 0 }}
            className="group-hover:opacity-100 transition-opacity flex-shrink-0"
          />
        </div>
      </div>
    </aside>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ title }: { title: string }) {
  const { userRole } = useView()

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
      <div className="flex items-center gap-3">
        <h1 style={{ color: 'var(--color-text-primary)' }} className="text-sm font-semibold">
          {title}
        </h1>
        {/* Role badge */}
        <span
          style={{
            backgroundColor: userRole === 'advogado' ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.12)',
            color: userRole === 'advogado' ? 'rgb(129,140,248)' : 'rgb(52,211,153)',
            border: userRole === 'advogado' ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(16,185,129,0.3)',
          }}
          className="hidden md:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
        >
          {userRole === 'advogado' ? (
            <><Briefcase size={10} /> Advogado</>
          ) : (
            <><Building2 size={10} /> Banco</>
          )}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
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

        <span style={{ color: 'var(--color-text-muted)' }} className="text-xs hidden md:block">
          {new Date().toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </span>
      </div>
    </header>
  )
}

// ─── Dashboard Layout ─────────────────────────────────────────────────────────
interface DashboardLayoutProps {
  children: ReactNode
  pageTitle?: string
}

export function DashboardLayout({ children, pageTitle = 'Dashboard' }: DashboardLayoutProps) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />

      {/* Main column */}
      <div
        className="flex flex-col flex-1 min-w-0"
        style={{ backgroundColor: 'var(--color-bg-base)' }}
      >
        <Header title={pageTitle} />

        {/* Content area */}
        <main className="flex-1 overflow-auto p-6 flex flex-col">
          <div className="max-w-[1280px] mx-auto w-full flex-1">{children}</div>
        </main>
      </div>
    </div>
  )
}
