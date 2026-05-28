export default function BottomNav({ page, setPage, menu = [] }) {
  return (
    <nav className="bottom-nav" aria-label="Menu principal">
      {menu.map((item) => {
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
