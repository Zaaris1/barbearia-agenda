import { useEffect, useState } from 'react'
import AppShell from './components/AppShell'
import Toast from './components/Toast'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import Clientes from './pages/Clientes'
import Servicos from './pages/Servicos'
import Barbeiros from './pages/Barbeiros'
import Financeiro from './pages/Financeiro'
import Configuracoes from './pages/Configuracoes'
import PublicBooking from './pages/PublicBooking'
import { clearSession, readSession, saveSession } from './lib/storage'
import { getBootstrap, logoutSession } from './lib/api'

function isPublicRoute() {
  const search = new URLSearchParams(window.location.search)
  return window.location.pathname.includes('/agendar') || search.get('publico') === '1'
}

export default function App() {
  const [session, setSession] = useState(() => readSession())
  const [bootstrap, setBootstrap] = useState(null)
  const [page, setPage] = useState('dashboard')
  const [toast, setToast] = useState(null)
  const [bootLoading, setBootLoading] = useState(false)
  const publicRoute = isPublicRoute()

  function showToast(message, type = 'success') {
    setToast({ message, type })
    window.clearTimeout(showToast.timer)
    showToast.timer = window.setTimeout(() => setToast(null), 4500)
  }

  async function refreshBootstrap() {
    if (!session?.session_token) return
    setBootLoading(true)
    try {
      const data = await getBootstrap(session.session_token)
      setBootstrap(data)
    } catch (error) {
      showToast(error.message, 'error')
      if (String(error.message || '').toLowerCase().includes('sess')) {
        clearSession()
        setSession(null)
      }
    } finally {
      setBootLoading(false)
    }
  }

  useEffect(() => {
    if (!publicRoute && session?.session_token) refreshBootstrap()
  }, [session?.session_token, publicRoute])

  function handleLogin(payload) {
    saveSession(payload)
    setSession(payload)
    showToast(`Bem-vindo, ${payload.user?.name || 'usuário'}!`)
  }

  async function handleLogout() {
    try {
      if (session?.session_token) await logoutSession(session.session_token)
    } catch {}
    clearSession()
    setSession(null)
    setBootstrap(null)
  }

  if (publicRoute) {
    return (
      <>
        <PublicBooking showToast={showToast} />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    )
  }

  if (!session) {
    return (
      <>
        <Login onLogin={handleLogin} showToast={showToast} />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    )
  }

  const commonProps = { session, bootstrap, showToast, refreshBootstrap }

  return (
    <>
      <AppShell session={session} bootstrap={bootstrap} page={page} setPage={setPage} onLogout={handleLogout}>
        {bootLoading && !bootstrap ? <div className="loading-card">Preparando o painel...</div> : null}
        {page === 'dashboard' && <Dashboard {...commonProps} />}
        {page === 'agenda' && <Agenda {...commonProps} />}
        {page === 'clientes' && <Clientes {...commonProps} />}
        {page === 'servicos' && <Servicos {...commonProps} />}
        {page === 'barbeiros' && <Barbeiros {...commonProps} />}
        {page === 'financeiro' && <Financeiro {...commonProps} />}
        {page === 'configuracoes' && <Configuracoes {...commonProps} />}
      </AppShell>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  )
}
