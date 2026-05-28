import { CalendarDays, Home, Scissors, Users, UserRoundCog, WalletCards } from 'lucide-react'

const items = [
  { id: 'dashboard', label: 'Início', icon: Home },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'servicos', label: 'Serviços', icon: Scissors },
  { id: 'barbeiros', label: 'Equipe', icon: UserRoundCog },
  { id: 'financeiro', label: 'Caixa', icon: WalletCards },
]

export default function BottomNav({ page, setPage }) {
  return (
    <nav className="bottom-nav">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)} type="button">
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
