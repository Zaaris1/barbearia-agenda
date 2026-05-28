import { CalendarDays, Home, LogOut, Scissors, Settings, UserRoundCog, Users, WalletCards } from 'lucide-react'
import BottomNav from './BottomNav'

const baseMenu = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'servicos', label: 'Serviços', icon: Scissors },
  { id: 'barbeiros', label: 'Barbeiros', icon: UserRoundCog, adminOnly: true },
  { id: 'financeiro', label: 'Financeiro', icon: WalletCards },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, adminOnly: true },
]

export default function AppShell({ session, bootstrap, page, setPage, onLogout, children }) {
  const isAdmin = session?.user?.role === 'ADMIN'
  const menu = baseMenu.filter((item) => !item.adminOnly || isAdmin)
  const shop = bootstrap?.barbershop || session?.barbershop || {}
  const roleLabel = isAdmin ? 'Administrador' : 'Barbeiro'
  const shopInitial = (shop?.name || 'B').trim().slice(0, 1).toUpperCase()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">{shopInitial}</div>
          <div>
            <strong>{shop?.name || 'Barbearia'}</strong>
            <span>{roleLabel}</span>
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
            <h1>{shop?.name || 'Agenda da Barbearia'}</h1>
          </div>
          <div className="user-pill">
            <span>{session?.user?.name}</span>
            <small>{roleLabel}</small>
          </div>
        </header>
        {children}
      </main>
      <BottomNav page={page} setPage={setPage} menu={menu} />
    </div>
  )
}
