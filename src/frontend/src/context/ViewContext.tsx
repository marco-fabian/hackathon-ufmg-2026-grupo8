import { createContext, useContext, useState, type ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
export type UserRole = 'banco' | 'advogado'

interface ViewContextValue {
  userRole: UserRole
  setUserRole: (role: UserRole) => void
  toggleRole: () => void
}

// ─── Context ──────────────────────────────────────────────────────────────────
const ViewContext = createContext<ViewContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────
interface ViewProviderProps {
  children: ReactNode
}

export function ViewProvider({ children }: ViewProviderProps) {
  const [userRole, setUserRole] = useState<UserRole>('advogado')

  const toggleRole = () =>
    setUserRole((prev) => (prev === 'advogado' ? 'banco' : 'advogado'))

  return (
    <ViewContext.Provider value={{ userRole, setUserRole, toggleRole }}>
      {children}
    </ViewContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useView(): ViewContextValue {
  const ctx = useContext(ViewContext)
  if (!ctx) {
    throw new Error('useView must be used inside <ViewProvider>')
  }
  return ctx
}
