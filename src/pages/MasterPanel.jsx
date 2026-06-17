import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Banknote, BarChart3, CalendarClock, Copy, ExternalLink, LockKeyhole, LogOut, Plus, Printer, RefreshCw, Save, Scissors, ShieldAlert, ShieldCheck, Store, WalletCards } from 'lucide-react'
import { clearMasterSession, readMasterSession, saveMasterSession } from '../lib/storage'
import { masterCreateBarbershop, masterGetSubscriptionReport, masterListBarbershops, masterLoginWithPin, masterLogout, masterRegisterPayment, masterUpdateBarbershop } from '../lib/api'
import { formatMoney, todayISO } from '../lib/dates'

function normalizeSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function addMonthsISO(baseDate, months = 1) {
  const date = baseDate ? new Date(`${baseDate}T12:00:00`) : new Date()
  date.setMonth(date.getMonth() + months)
  return date.toISOString().slice(0, 10)
}

function currentMonth() {
  return todayISO().slice(0, 7)
}

function statusClass(status, blocked) {
  const normalized = String(status || '').toLowerCase()
  if (blocked || normalized.includes('bloqueado') || normalized.includes('cancelado') || normalized.includes('inativo')) return 'danger'
  if (normalized.includes('pendente')) return 'warn'
  return 'ok'
}

const emptyNewShop = {
  name: '',
  slug: '',
  phone: '',
  address: '',
  monthlyFee: 97,
  subscriptionDueDate: addMonthsISO(todayISO(), 1),
  adminName: 'Administrador',
  adminPin: '1234',
}

export default function MasterPanel({ showToast }) {
  const [session, setSession] = useState(() => readMasterSession())
  const [pin, setPin] = useState('')
  const [loginMessage, setLoginMessage] = useState('')
  const [loadingLogin, setLoadingLogin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [shops, setShops] = useState([])
  const [newShop, setNewShop] = useState(emptyNewShop)
  const [editing, setEditing] = useState(null)
  const [payment, setPayment] = useState(null)
  const [saving, setSaving] = useState(false)
  const [reportMonth, setReportMonth] = useState(currentMonth())
  const [subscriptionReport, setSubscriptionReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)

  const activeCount = shops.filter((s) => s.active && !s.subscription_blocked).length
  const blockedCount = shops.filter((s) => s.subscription_blocked).length
  const monthlyTotal = shops.filter((s) => s.active).reduce((sum, s) => sum + Number(s.monthly_fee || 0), 0)
  const monthAppointments = shops.reduce((sum, s) => sum + Number(s.month_appointments || 0), 0)

  const filteredShops = useMemo(() => shops, [shops])

  async function login(e) {
    e.preventDefault()
    if (!pin.trim()) {
      setLoginMessage('Informe o PIN master.')
      showToast('Informe o PIN master.', 'error')
      return
    }
    setLoadingLogin(true)
    try {
      setLoginMessage('')
      const result = await masterLoginWithPin(pin.trim())
      if (!result?.master_session_token) throw new Error('Login master não retornou sessão.')
      saveMasterSession(result)
      setSession(result)
      showToast('Painel master acessado com sucesso.')
    } catch (error) {
      const message = error.message || 'PIN master inválido.'
      setLoginMessage(message)
      showToast(message, 'error')
    } finally {
      setLoadingLogin(false)
    }
  }

  async function logout() {
    try {
      if (session?.master_session_token) await masterLogout(session.master_session_token)
    } catch {}
    clearMasterSession()
    setSession(null)
    setShops([])
  }

  async function loadShops() {
    if (!session?.master_session_token) return
    setLoading(true)
    try {
      setShops(await masterListBarbershops(session.master_session_token))
    } catch (error) {
      showToast(error.message, 'error')
      if (String(error.message || '').toLowerCase().includes('sess')) {
        clearMasterSession()
        setSession(null)
      }
    } finally {
      setLoading(false)
    }
  }


  async function loadSubscriptionReport() {
    if (!session?.master_session_token) return
    setReportLoading(true)
    try {
      setSubscriptionReport(await masterGetSubscriptionReport(session.master_session_token, reportMonth))
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => { loadShops() }, [session?.master_session_token])
  useEffect(() => { loadSubscriptionReport() }, [session?.master_session_token, reportMonth])

  function setNewField(field, value) {
    setNewShop((old) => ({ ...old, [field]: value }))
  }

  async function createShop(e) {
    e.preventDefault()
    if (!newShop.name.trim()) return showToast('Informe o nome da barbearia.', 'error')
    if (!normalizeSlug(newShop.slug)) return showToast('Informe o identificador público.', 'error')
    if (!newShop.adminPin.trim()) return showToast('Informe o PIN do administrador inicial.', 'error')

    setSaving(true)
    try {
      const result = await masterCreateBarbershop(session.master_session_token, {
        ...newShop,
        slug: normalizeSlug(newShop.slug),
      })
      showToast(`Barbearia ${result.name} criada com sucesso.`)
      setNewShop(emptyNewShop)
      await loadShops()
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(shop) {
    setEditing({
      id: shop.id,
      name: shop.name || '',
      slug: shop.slug || '',
      phone: shop.phone || '',
      address: shop.address || '',
      active: shop.active !== false,
      publicBookingEnabled: shop.public_booking_enabled !== false,
      subscriptionStatus: shop.raw_subscription_status || shop.subscription_status || 'ATIVO',
      subscriptionDueDate: shop.subscription_due_date || todayISO(),
      subscriptionGraceDays: Number(shop.subscription_grace_days ?? 5),
      monthlyFee: Number(shop.monthly_fee || 0),
      blockedReason: shop.blocked_reason || '',
    })
    setPayment(null)
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!editing?.id) return
    setSaving(true)
    try {
      await masterUpdateBarbershop(session.master_session_token, {
        ...editing,
        slug: normalizeSlug(editing.slug),
      })
      showToast('Barbearia atualizada com sucesso.')
      setEditing(null)
      await loadShops()
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function openPayment(shop) {
    setPayment({
      barbershopId: shop.id,
      name: shop.name,
      amount: Number(shop.monthly_fee || 0),
      nextDueDate: addMonthsISO(shop.subscription_due_date || todayISO(), 1),
      notes: '',
    })
    setEditing(null)
  }

  async function registerPayment(e) {
    e.preventDefault()
    if (!payment?.barbershopId) return
    setSaving(true)
    try {
      await masterRegisterPayment(session.master_session_token, payment)
      showToast('Pagamento registrado. A barbearia foi liberada/renovada.')
      setPayment(null)
      await loadShops()
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function printMasterReport() {
    window.print()
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Link copiado.')
    } catch {
      showToast('Não foi possível copiar automaticamente.', 'error')
    }
  }

  if (!session) {
    return (
      <div className="login-page master-login-page">
        <div className="login-orb orb-1" />
        <div className="login-orb orb-2" />
        <motion.div className="login-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="login-logo"><ShieldCheck size={34} /></div>
          <span className="eyebrow centered">Painel da plataforma</span>
          <h1>Master</h1>
          <p>Acesse para criar barbearias, controlar mensalidades e bloquear clientes inadimplentes.</p>
          <form onSubmit={login} className="form-stack">
            <label>
              <span>PIN master</span>
              <div className="input-icon">
                <LockKeyhole size={18} />
                <input value={pin} onChange={(e) => { setPin(e.target.value); setLoginMessage('') }} placeholder="Digite o PIN master" type="password" inputMode="numeric" autoFocus />
              </div>
            </label>
            {loginMessage && (
              <div className="login-attempt-warning compact">
                <ShieldAlert size={18} />
                <span>{loginMessage}</span>
              </div>
            )}
            <button className="btn primary full" type="submit" disabled={loadingLogin}>{loadingLogin ? 'Entrando...' : 'Entrar no Master'}</button>
          </form>
          <div className="demo-box">
            <strong>PIN inicial</strong>
            <span>Master: 9999</span>
            <span>Troque depois pelo SQL indicado no arquivo 005.</span>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="master-page">
      <header className="master-topbar">
        <div className="brand-block compact">
          <div className="brand-mark"><Scissors size={22} /></div>
          <div>
            <strong>Barbearia Agenda</strong>
            <span>Gestão multi-barbearias</span>
          </div>
        </div>
        <div className="master-actions">
          <button className="btn soft" type="button" onClick={loadShops}><RefreshCw size={17} /> Atualizar</button>
          <button className="btn ghost" type="button" onClick={logout}><LogOut size={17} /> Sair</button>
        </div>
      </header>

      <main className="master-main">
        <section className="page-heading master-heading">
          <div>
            <span className="eyebrow">Painel master</span>
            <h2>Clientes da plataforma</h2>
            <p>Crie barbearias, gere links de acesso e controle mensalidades/bloqueios.</p>
          </div>
        </section>

        <div className="stats-grid four">
          <div className="stat-card"><Store size={22} /><span>Ativas</span><strong>{activeCount}</strong><small>Clientes liberados</small></div>
          <div className="stat-card"><ShieldAlert size={22} /><span>Bloqueadas</span><strong>{blockedCount}</strong><small>Pendência ou bloqueio</small></div>
          <div className="stat-card"><WalletCards size={22} /><span>Mensalidades</span><strong>{formatMoney(monthlyTotal)}</strong><small>Previsão mensal ativa</small></div>
          <div className="stat-card"><CalendarClock size={22} /><span>Agendamentos</span><strong>{monthAppointments}</strong><small>No mês atual</small></div>
        </div>

        <section className="panel-card master-report-card print-master-report">
          <div className="panel-title with-actions">
            <div>
              <h3>Relatório mensal da plataforma</h3>
              <span>{reportLoading ? 'Atualizando...' : `Competência ${reportMonth}`}</span>
            </div>
            <div className="heading-actions">
              <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
              <button className="btn soft" type="button" onClick={loadSubscriptionReport}><RefreshCw size={16} /> Atualizar</button>
              <button className="btn primary" type="button" onClick={printMasterReport}><Printer size={16} /> Salvar PDF</button>
            </div>
          </div>

          <div className="print-only print-report-header">
            <h1>Relatório mensal da plataforma</h1>
            <p>Competência {reportMonth}</p>
            <small>Gerado em {new Date().toLocaleString('pt-BR')}</small>
          </div>

          <div className="stats-grid four compact-stats">
            <div className="stat-card"><WalletCards size={22} /><span>Previsto</span><strong>{formatMoney(subscriptionReport?.stats?.expected_revenue || 0)}</strong><small>Mensalidades ativas</small></div>
            <div className="stat-card"><Banknote size={22} /><span>Recebido</span><strong>{formatMoney(subscriptionReport?.stats?.received_revenue || 0)}</strong><small>Pagamentos lançados</small></div>
            <div className="stat-card"><ShieldAlert size={22} /><span>Pendente/Bloq.</span><strong>{subscriptionReport?.stats?.pending_or_blocked || 0}</strong><small>Clientes que exigem ação</small></div>
            <div className="stat-card"><BarChart3 size={22} /><span>Ticket médio</span><strong>{formatMoney(subscriptionReport?.stats?.average_fee || 0)}</strong><small>Mensalidade média</small></div>
          </div>

          <div className="master-report-grid">
            <div className="finance-table">
              <div className="panel-subtitle">Mensalidades e vencimentos</div>
              {(subscriptionReport?.shops || []).length === 0 && <div className="empty-state">Nenhum cliente no relatório.</div>}
              {(subscriptionReport?.shops || []).map((shop) => (
                <div className="finance-row master-report-row" key={shop.id}>
                  <span><b>{shop.name}</b><small>{shop.slug}</small></span>
                  <small>{shop.subscription_status} • Vence: {shop.subscription_due_date || '-'}</small>
                  <small>{shop.days_overdue > 0 ? `${shop.days_overdue} dia(s) em atraso` : 'Em dia ou dentro da tolerância'}</small>
                  <strong>{formatMoney(shop.monthly_fee || 0)}</strong>
                </div>
              ))}
            </div>

            <div className="finance-table">
              <div className="panel-subtitle">Pagamentos registrados</div>
              {(subscriptionReport?.payments || []).length === 0 && <div className="empty-state">Nenhum pagamento lançado neste mês.</div>}
              {(subscriptionReport?.payments || []).map((item) => (
                <div className="finance-row master-report-row" key={item.id}>
                  <span><b>{item.barbershop_name}</b><small>{item.paid_at ? new Date(item.paid_at).toLocaleDateString('pt-BR') : '-'}</small></span>
                  <small>{item.notes || 'Sem observação'}</small>
                  <strong>{formatMoney(item.amount || 0)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="master-grid">
          <section className="panel-card master-create-card">
            <div className="panel-title"><h3>Nova barbearia</h3><span>Cliente inicial</span></div>
            <form onSubmit={createShop} className="form-stack">
              <label><span>Nome da barbearia</span><input value={newShop.name} onChange={(e) => setNewField('name', e.target.value)} placeholder="Barbearia do João" required /></label>
              <label><span>Slug/link</span><input value={newShop.slug} onChange={(e) => setNewField('slug', normalizeSlug(e.target.value))} placeholder="barbearia-do-joao" required /></label>
              <label><span>WhatsApp</span><input value={newShop.phone} onChange={(e) => setNewField('phone', e.target.value)} placeholder="(00) 00000-0000" /></label>
              <label><span>Endereço</span><input value={newShop.address} onChange={(e) => setNewField('address', e.target.value)} placeholder="Rua, número, cidade" /></label>
              <div className="form-grid two">
                <label><span>Mensalidade</span><input type="number" min="0" step="0.01" value={newShop.monthlyFee} onChange={(e) => setNewField('monthlyFee', e.target.value)} /></label>
                <label><span>Primeiro vencimento</span><input type="date" value={newShop.subscriptionDueDate} onChange={(e) => setNewField('subscriptionDueDate', e.target.value)} /></label>
              </div>
              <div className="form-grid two">
                <label><span>Nome do admin</span><input value={newShop.adminName} onChange={(e) => setNewField('adminName', e.target.value)} /></label>
                <label><span>PIN do admin</span><input value={newShop.adminPin} onChange={(e) => setNewField('adminPin', e.target.value)} inputMode="numeric" /></label>
              </div>
              <button className="btn primary full" type="submit" disabled={saving}><Plus size={17} /> {saving ? 'Criando...' : 'Criar barbearia'}</button>
            </form>
          </section>

          <section className="panel-card master-list-card">
            <div className="panel-title"><h3>Barbearias cadastradas</h3><span>{loading ? 'Carregando...' : `${filteredShops.length} cliente(s)`}</span></div>
            <div className="master-shop-list">
              {filteredShops.length === 0 && <div className="empty-state">Nenhuma barbearia cadastrada ainda.</div>}
              {filteredShops.map((shop) => {
                const internalLink = `${window.location.origin}/app/${shop.slug}`
                const publicLink = `${window.location.origin}/agendar/${shop.slug}`
                return (
                  <div className="master-shop-card" key={shop.id}>
                    <div className="shop-card-head">
                      <div>
                        <strong>{shop.name}</strong>
                        <span>{shop.slug}</span>
                      </div>
                      <span className={`mini-status ${statusClass(shop.subscription_status, shop.subscription_blocked)}`}>{shop.subscription_status}</span>
                    </div>
                    <div className="shop-metrics">
                      <span><b>{formatMoney(shop.monthly_fee || 0)}</b><small>Mensalidade</small></span>
                      <span><b>{shop.subscription_due_date || '-'}</b><small>Vencimento</small></span>
                      <span><b>{shop.month_appointments || 0}</b><small>Agend. mês</small></span>
                      <span><b>{formatMoney(shop.month_revenue || 0)}</b><small>Receita cliente</small></span>
                    </div>
                    <div className="shop-links">
                      <button type="button" onClick={() => copy(internalLink)}><Copy size={14} /> Painel</button>
                      <a href={internalLink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir painel</a>
                      <button type="button" onClick={() => copy(publicLink)}><Copy size={14} /> Público</button>
                      <a href={publicLink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir público</a>
                    </div>
                    {shop.subscription_blocked && <div className="block-warning">Esta barbearia está bloqueada para login e agendamento público.</div>}
                    <div className="shop-actions-row">
                      <button className="btn soft" type="button" onClick={() => openEdit(shop)}><Save size={15} /> Editar/Status</button>
                      <button className="btn primary" type="button" onClick={() => openPayment(shop)}><Banknote size={15} /> Registrar pagamento</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {(editing || payment) && (
          <section className="panel-card master-editor">
            {editing && (
              <form onSubmit={saveEdit} className="form-stack">
                <div className="panel-title"><h3>Editar barbearia</h3><span>{editing.name}</span></div>
                <div className="form-grid">
                  <label><span>Nome</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
                  <label><span>Slug</span><input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: normalizeSlug(e.target.value) })} /></label>
                  <label><span>WhatsApp</span><input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></label>
                  <label><span>Endereço</span><input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></label>
                  <label><span>Status financeiro</span><select value={editing.subscriptionStatus} onChange={(e) => setEditing({ ...editing, subscriptionStatus: e.target.value })}><option value="ATIVO">ATIVO</option><option value="PENDENTE">PENDENTE</option><option value="BLOQUEADO">BLOQUEADO</option><option value="INATIVO">INATIVO</option><option value="CANCELADO">CANCELADO</option></select></label>
                  <label><span>Vencimento</span><input type="date" value={editing.subscriptionDueDate || ''} onChange={(e) => setEditing({ ...editing, subscriptionDueDate: e.target.value })} /></label>
                  <label><span>Dias de tolerância</span><input type="number" min="0" value={editing.subscriptionGraceDays} onChange={(e) => setEditing({ ...editing, subscriptionGraceDays: e.target.value })} /></label>
                  <label><span>Mensalidade</span><input type="number" min="0" step="0.01" value={editing.monthlyFee} onChange={(e) => setEditing({ ...editing, monthlyFee: e.target.value })} /></label>
                  <label className="check-row"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /><span>Cliente ativo</span></label>
                  <label className="check-row"><input type="checkbox" checked={editing.publicBookingEnabled} onChange={(e) => setEditing({ ...editing, publicBookingEnabled: e.target.checked })} /><span>Agendamento público ativo</span></label>
                  <label className="full"><span>Motivo do bloqueio</span><textarea value={editing.blockedReason} onChange={(e) => setEditing({ ...editing, blockedReason: e.target.value })} rows="3" placeholder="Ex: mensalidade em atraso" /></label>
                </div>
                <div className="heading-actions"><button className="btn soft" type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="btn primary" type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
              </form>
            )}

            {payment && (
              <form onSubmit={registerPayment} className="form-stack">
                <div className="panel-title"><h3>Registrar pagamento</h3><span>{payment.name}</span></div>
                <div className="form-grid">
                  <label><span>Valor recebido</span><input type="number" min="0" step="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></label>
                  <label><span>Próximo vencimento</span><input type="date" value={payment.nextDueDate} onChange={(e) => setPayment({ ...payment, nextDueDate: e.target.value })} /></label>
                  <label className="full"><span>Observação</span><textarea value={payment.notes} onChange={(e) => setPayment({ ...payment, notes: e.target.value })} rows="3" placeholder="Ex: pagamento via Pix" /></label>
                </div>
                <div className="heading-actions"><button className="btn soft" type="button" onClick={() => setPayment(null)}>Cancelar</button><button className="btn primary" type="submit" disabled={saving}>{saving ? 'Registrando...' : 'Registrar e liberar'}</button></div>
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
