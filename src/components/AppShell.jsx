import { CalendarDays, Home, LogOut, Scissors, UserRoundCog, Users, WalletCards } from 'lucide-react'
import BottomNav from './BottomNav'

const menu = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'servicos', label: 'Serviços', icon: Scissors },
  { id: 'barbeiros', label: 'Barbeiros', icon: UserRoundCog },
  { id: 'financeiro', label: 'Financeiro', icon: WalletCards },
]

export default function AppShell({ session, page, setPage, onLogout, children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">B</div>
          <div>
            <strong>{session?.barbershop?.name || 'Barbearia'}</strong>
            <span>{session?.user?.role === 'ADMIN' ? 'Administrador' : 'Barbeiro'}</span>
          </div>
        </div>
        <div className="side-menu">
          {menu.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} type="button" className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            )
          })}
        </div>
        <button type="button" className="logout-btn" onClick={onLogout}>
          <LogOut size={18} />
          Sair
        </button>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">Painel interno</span>
            <h1>{session?.barbershop?.name || 'Agenda da Barbearia'}</h1>
          </div>
          <div className="user-pill">
            <span>{session?.user?.name}</span>
            <small>{session?.user?.role}</small>
          </div>
        </header>
        {children}
      </main>
      <BottomNav page={page} setPage={setPage} />
    </div>
  )
}
