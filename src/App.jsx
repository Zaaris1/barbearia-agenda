import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import AppShell, { homePageForRole, isPageAllowedForRole } from './components/AppShell'
import Toast from './components/Toast'
import { clearSession, readSession, saveSession } from './lib/storage'
import { getBootstrap, logoutSession } from './lib/api'
import { applyDocumentBrand } from './lib/branding'

const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Agenda = lazy(() => import('./pages/Agenda'))
const Clientes = lazy(() => import('./pages/Clientes'))
const Servicos = lazy(() => import('./pages/Servicos'))
const Barbeiros = lazy(() => import('./pages/Barbeiros'))
const Financeiro = lazy(() => import('./pages/Financeiro'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))
const PublicBooking = lazy(() => import('./pages/PublicBooking'))
const MasterPanel = lazy(() => import('./pages/MasterPanel'))
const BarbershopPortal = lazy(() => import('./pages/BarbershopPortal'))
const ClientAppointments = lazy(() => import('./pages/ClientAppointments'))

const internalPages = {
  dashboard: Dashboard,
  agenda: Agenda,
  clientes: Clientes,
  servicos: Servicos,
  barbeiros: Barbeiros,
  financeiro: Financeiro,
  configuracoes: Configuracoes,
}

function RouteFallback() {
  return <div className="loading-card route-loading">Carregando tela...</div>
}

function LazyRoute({ children }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>
}

function getRouteInfo() {
  const search = new URLSearchParams(window.location.search)
  const parts = window.location.pathname.split('/').filter(Boolean)
  const isPublic = parts[0] === 'agendar' || search.get('publico') === '1'
  const isClientAppointments = parts[0] === 'meus-agendamentos'
  const isMaster = parts[0] === 'master'
  const isApp = parts[0] === 'app'
  const appSlug = isApp && parts[1] ? parts[1] : ''
  const publicSlug = parts[0] === 'agendar' && parts[1] ? parts[1] : ''
  const portalSlug = !isPublic && !isClientAppointments && !isMaster && !isApp ? (parts[0] || import.meta.env.VITE_DEFAULT_SHOP_SLUG || 'barbearia-demo') : ''

  return {
    isPublic,
    isClientAppointments,
    isMaster,
    isApp,
    appSlug,
    publicSlug,
    portalSlug,
    isPortal: Boolean(portalSlug),
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
    if (route.isPublic || route.isClientAppointments || route.isMaster || route.isPortal) return

    if (route.appSlug && session?.barbershop?.slug && session.barbershop.slug !== route.appSlug) {
      clearSession()
      setSession(null)
      setBootstrap(null)
      return
    }

    if (session?.session_token) refreshBootstrap()
  }, [session?.session_token, route.isPublic, route.isClientAppointments, route.isMaster, route.isPortal, route.appSlug])

  useEffect(() => {
    if (!session?.user?.role) return
    if (!isPageAllowedForRole(session.user.role, page)) {
      setPage(homePageForRole(session.user.role))
    }
  }, [session?.user?.role, page])

  function handleLogin(payload) {
    saveSession(payload)
    setSession(payload)
    setPage(homePageForRole(payload.user?.role))
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
        <LazyRoute>
          <MasterPanel showToast={showToast} />
        </LazyRoute>
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    )
  }

  if (route.isClientAppointments) {
    return (
      <>
        <LazyRoute>
          <ClientAppointments showToast={showToast} />
        </LazyRoute>
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    )
  }

  if (route.isPublic) {
    return (
      <>
        <LazyRoute>
          <PublicBooking showToast={showToast} />
        </LazyRoute>
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    )
  }

  if (route.isPortal) {
    return (
      <>
        <LazyRoute>
          <BarbershopPortal showToast={showToast} fallbackSlug={route.portalSlug} />
        </LazyRoute>
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    )
  }

  if (!session) {
    return (
      <>
        <LazyRoute>
          <Login onLogin={handleLogin} showToast={showToast} forcedShopSlug={route.appSlug} />
        </LazyRoute>
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    )
  }

  const commonProps = { session, bootstrap, showToast, refreshBootstrap }
  const activePageId = isPageAllowedForRole(session?.user?.role, page) ? page : homePageForRole(session?.user?.role)
  const ActivePage = internalPages[activePageId] || Dashboard

  return (
    <>
      <AppShell session={session} bootstrap={bootstrap} page={activePageId} setPage={setPage} onLogout={handleLogout}>
        {bootLoading && !bootstrap ? <div className="loading-card">Preparando o painel...</div> : null}
        <LazyRoute>
          <ActivePage {...commonProps} />
        </LazyRoute>
      </AppShell>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  )
}
