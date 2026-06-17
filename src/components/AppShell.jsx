import { CalendarDays, Home, LogOut, Scissors, Settings, UserRoundCog, Users, WalletCards } from 'lucide-react'
import BottomNav from './BottomNav'
import { buildThemeStyle, normalizeUrl } from '../lib/branding'

const baseMenu = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, roles: ['ADMIN', 'BARBER', 'ATTENDANT'] },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays, roles: ['ADMIN', 'BARBER', 'ATTENDANT'] },
  { id: 'clientes', label: 'Clientes', icon: Users, roles: ['ADMIN', 'ATTENDANT'] },
  { id: 'servicos', label: 'Serviços', icon: Scissors, roles: ['ADMIN'] },
  { id: 'barbeiros', label: 'Equipe', icon: UserRoundCog, roles: ['ADMIN'] },
  { id: 'financeiro', label: 'Financeiro', icon: WalletCards, roles: ['ADMIN'] },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, roles: ['ADMIN'] },
]

export const ROLE_LABELS = {
  ADMIN: 'Gestor',
  BARBER: 'Profissional',
  ATTENDANT: 'Atendente',
}

function normalizeRole(role) {
  return ROLE_LABELS[role] ? role : 'BARBER'
}

export function allowedPagesForRole(role) {
  const normalizedRole = normalizeRole(role)
  return baseMenu.filter((item) => item.roles.includes(normalizedRole)).map((item) => item.id)
}

export function homePageForRole(role) {
  const pages = allowedPagesForRole(role)
  return pages[0] || 'dashboard'
}

export function isPageAllowedForRole(role, page) {
  return allowedPagesForRole(role).includes(page)
}

function statusClass(status) {
  const normalized = String(status || 'ATIVO').toLowerCase()
  if (normalized.includes('bloqueado') || normalized.includes('cancelado') || normalized.includes('inativo')) return 'danger'
  if (normalized.includes('pendente')) return 'warn'
  return 'ok'
}

export default function AppShell({ session, bootstrap, page, setPage, onLogout, children }) {
  const role = normalizeRole(session?.user?.role)
  const menu = baseMenu.filter((item) => item.roles.includes(role))
  const shop = bootstrap?.barbershop || session?.barbershop || {}
  const roleLabel = ROLE_LABELS[role]
  const shopInitial = (shop?.name || 'B').trim().slice(0, 1).toUpperCase()
  const subscriptionStatus = shop?.subscription_status || 'ATIVO'
  const logoUrl = normalizeUrl(shop?.logo_url)
  const shellStyle = buildThemeStyle(shop)

  return (
    <div className="app-shell branded-shell" style={shellStyle}>
      <aside className="sidebar">
        <div className="brand-block">
          <div className={`brand-mark ${logoUrl ? 'with-image' : ''}`}>
            {logoUrl ? <img src={logoUrl} alt={`Logo ${shop?.name || 'Barbearia'}`} /> : shopInitial}
          </div>
          <div>
            <strong>{shop?.name || 'Barbearia'}</strong>
            <span>{shop?.slogan || roleLabel}</span>
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
        <header className="topbar branded-topbar">
          <div>
            <span className="eyebrow">Painel interno</span>
            <h1>{shop?.name || 'Agenda da Barbearia'}</h1>
            {shop?.slogan && <p className="topbar-slogan">{shop.slogan}</p>}
          </div>
          <div className="topbar-actions">
            <div className={`subscription-pill ${statusClass(subscriptionStatus)}`}>
              <span>{subscriptionStatus}</span>
              {shop?.subscription_due_date && <small>Vence {shop.subscription_due_date}</small>}
            </div>
            <div className="user-pill">
              <span>{session?.user?.name}</span>
              <small>{roleLabel}</small>
            </div>
          </div>
        </header>
        {children}
      </main>
      <BottomNav page={page} setPage={setPage} menu={menu} />
    </div>
  )
}
