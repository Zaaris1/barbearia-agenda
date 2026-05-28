import { useEffect, useMemo, useState } from 'react'
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
import MasterPanel from './pages/MasterPanel'
import { clearSession, readSession, saveSession } from './lib/storage'
import { getBootstrap, logoutSession } from './lib/api'
import { applyDocumentBrand } from './lib/branding'

function getRouteInfo() {
  const search = new URLSearchParams(window.location.search)
  const parts = window.location.pathname.split('/').filter(Boolean)
  const isPublic = parts[0] === 'agendar' || search.get('publico') === '1'
  const isMaster = parts[0] === 'master'
  const appSlug = parts[0] === 'app' && parts[1] ? parts[1] : ''
  const publicSlug = parts[0] === 'agendar' && parts[1] ? parts[1] : ''

  return {
    isPublic,
    isMaster,
    appSlug,
    publicSlug,
  }
}

export default function App() {
  const route = useMemo(() => getRouteInfo(), [])
  const [session, setSession] = useState(() => readSession())
  const [bootstrap, setBootstrap] = useState(null)
  const [page, setPage] = useState('dashboard')
  const [toast, setToast] = useState(null)
  const [bootLoading, setBootLoading] = useState(false)

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
      clearSession()
      setSession(null)
      setBootstrap(null)
    } finally {
      setBootLoading(false)
    }
  }

  useEffect(() => {
    const shop = bootstrap?.barbershop || session?.barbershop
    if (shop) applyDocumentBrand(shop)
  }, [bootstrap?.barbershop, session?.barbershop])

  useEffect(() => {
    if (route.isPublic || route.isMaster) return

    if (route.appSlug && session?.barbershop?.slug && session.barbershop.slug !== route.appSlug) {
      clearSession()
      setSession(null)
      setBootstrap(null)
      return
    }

    if (session?.session_token) refreshBootstrap()
  }, [session?.session_token, route.isPublic, route.isMaster, route.appSlug])

  function handleLogin(payload) {
    saveSession(payload)
    setSession(payload)
    showToast(`Bem-vindo, ${payload.user?.name || 'usuário'}!`)

    const slug = payload?.barbershop?.slug
    if (slug && window.location.pathname === '/') {
      window.history.replaceState(null, '', `/app/${slug}`)
    }
  }

  async function handleLogout() {
    try {
      if (session?.session_token) await logoutSession(session.session_token)
    } catch {}
    clearSession()
    setSession(null)
    setBootstrap(null)
  }

  if (route.isMaster) {
    return (
      <>
        <MasterPanel showToast={showToast} />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    )
  }

  if (route.isPublic) {
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
        <Login onLogin={handleLogin} showToast={showToast} forcedShopSlug={route.appSlug} />
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
