import { useState, type ReactNode } from 'react'
import {
  CalendarDays,
  CreditCard,
  Database,
  History as HistoryIcon,
  LayoutDashboard,
  Receipt,
  ShoppingBag,
  Wallet
} from 'lucide-react'
import { ToastProvider } from './components/Toast'
import { Calendar } from './pages/Calendar'
import { Cards } from './pages/Cards'
import { Dashboard } from './pages/Dashboard'
import { DataExport } from './pages/DataExport'
import { FixedExpenses } from './pages/FixedExpenses'
import { History } from './pages/History'
import { Purchases } from './pages/Purchases'

export type PageId = 'dashboard' | 'calendar' | 'history' | 'fixed' | 'purchases' | 'cards' | 'data'

const NAV: { id: PageId; label: string; icon: ReactNode }[] = [
  { id: 'dashboard', label: 'Resumo', icon: <LayoutDashboard size={18} /> },
  { id: 'calendar', label: 'Calendário', icon: <CalendarDays size={18} /> },
  { id: 'history', label: 'Histórico', icon: <HistoryIcon size={18} /> },
  { id: 'fixed', label: 'Gastos fixos', icon: <Receipt size={18} /> },
  { id: 'purchases', label: 'Compras', icon: <ShoppingBag size={18} /> },
  { id: 'cards', label: 'Cartões', icon: <CreditCard size={18} /> },
  { id: 'data', label: 'Dados', icon: <Database size={18} /> }
]

export function App() {
  const [page, setPage] = useState<PageId>('dashboard')

  return (
    <ToastProvider>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <Wallet size={20} />
            </div>
            <div>
              <div className="brand-name">Controle</div>
              <div className="brand-sub">Gastos pessoais</div>
            </div>
          </div>
          {NAV.slice(0, 6).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          <div className="nav-spacer" />
          <button className={`nav-item ${page === 'data' ? 'active' : ''}`} onClick={() => setPage('data')}>
            {NAV[6].icon}
            {NAV[6].label}
          </button>
        </aside>
        <main className="main">
          {page === 'dashboard' ? <Dashboard /> : null}
          {page === 'calendar' ? <Calendar /> : null}
          {page === 'history' ? <History /> : null}
          {page === 'fixed' ? <FixedExpenses /> : null}
          {page === 'purchases' ? <Purchases onNavigate={setPage} /> : null}
          {page === 'cards' ? <Cards /> : null}
          {page === 'data' ? <DataExport /> : null}
        </main>
      </div>
    </ToastProvider>
  )
}
