import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, MessageCircle, RefreshCcw, Scissors, Search, XCircle } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import { publicCancelClientAppointment, publicFindClientAppointments } from '../lib/api'
import { applyDocumentBrand, buildThemeStyle, normalizeUrl, whatsappLink } from '../lib/branding'
import { formatDateBR, formatMoney } from '../lib/dates'
import { getPaymentStatusClass, getPaymentStatusLabel } from '../lib/pix'

function getSlug() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts[0] === 'meus-agendamentos' && parts[1]) return parts[1]
  return import.meta.env.VITE_DEFAULT_SHOP_SLUG || 'barbearia-demo'
}

function canClientCancel(appointment) {
  return ['PENDENTE_CONFIRMACAO', 'AGENDADO', 'CONFIRMADO'].includes(appointment.status)
}

export default function ClientAppointments({ showToast }) {
  const [slug] = useState(getSlug())
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const shop = result?.shop || null
  const appointments = result?.appointments || []
  const themeStyle = buildThemeStyle(shop || {})
  const logoUrl = normalizeUrl(shop?.logo_url)
  const coverUrl = normalizeUrl(shop?.cover_url)

  useEffect(() => {
    if (shop) applyDocumentBrand(shop)
  }, [shop?.id])

  const nextAppointments = useMemo(() => appointments.filter((item) => !['CANCELADO', 'FALTOU', 'CONCLUIDO'].includes(item.status)), [appointments])

  async function searchAppointments(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await publicFindClientAppointments(slug, phone)
      setResult(data)
      if ((data?.appointments || []).length === 0) {
        showToast('Nenhum agendamento encontrado para este WhatsApp.', 'error')
      }
    } catch (err) {
      setError(err.message || 'Não foi possível consultar seus agendamentos.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  async function cancelAppointment(appointment) {
    const reason = window.prompt('Motivo opcional do cancelamento:', 'Cancelado pelo cliente') || 'Cancelado pelo cliente'
    try {
      await publicCancelClientAppointment(slug, appointment.id, phone, reason)
      showToast('Agendamento cancelado. A barbearia poderá visualizar o cancelamento no painel.')
      const data = await publicFindClientAppointments(slug, phone)
      setResult(data)
    } catch (err) {
      showToast(err.message || 'Não foi possível cancelar este agendamento.', 'error')
    }
  }

  return (
    <main className="client-appointments-page branded-public" style={themeStyle}>
      <div className="public-orb one" />
      <div className="public-orb two" />

      <section className="client-appointments-shell">
        <div className="client-appointments-hero" style={{ backgroundImage: coverUrl ? `linear-gradient(135deg, rgba(0,0,0,.18), rgba(0,0,0,.88)), url(${coverUrl})` : undefined }}>
          <div className={`public-logo ${logoUrl ? 'with-image' : ''}`}>
            {logoUrl ? <img src={logoUrl} alt={`Logo ${shop?.name || 'Barbearia'}`} /> : <Scissors size={30} />}
          </div>
          <span className="eyebrow">Área do cliente</span>
          <h1>Meus agendamentos</h1>
          <p>Consulte seus próximos horários usando o mesmo WhatsApp informado no agendamento.</p>
          {shop?.phone && <a className="btn soft" href={whatsappLink(shop.phone, `Olá! Preciso de ajuda com meu agendamento.`)} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Falar com a barbearia</a>}
        </div>

        <div className="client-appointments-card">
          <form className="client-search-form" onSubmit={searchAppointments}>
            <label>
              <span>Seu WhatsApp</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" required />
            </label>
            <button className="btn primary" type="submit" disabled={loading}><Search size={17} /> {loading ? 'Consultando...' : 'Consultar'}</button>
          </form>

          {error && <div className="public-error-message">{error}</div>}

          {result && (
            <div className="client-results">
              <div className="client-results-heading">
                <div>
                  <span className="eyebrow">Resultado</span>
                  <h2>{nextAppointments.length > 0 ? 'Próximos horários' : 'Nenhum horário ativo'}</h2>
                </div>
                <button className="btn soft" type="button" onClick={() => publicFindClientAppointments(slug, phone).then(setResult)}><RefreshCcw size={16} /> Atualizar</button>
              </div>

              {appointments.length === 0 && <div className="empty-state big">Nenhum agendamento foi encontrado com este WhatsApp.</div>}

              <div className="client-appointments-list">
                {appointments.map((appointment) => (
                  <article className="client-appointment-card" key={appointment.id}>
                    <div className="client-appointment-top">
                      <div>
                        <strong>{appointment.service_name}</strong>
                        <span><CalendarClock size={15} /> {formatDateBR(appointment.date)} às {appointment.start_time?.slice(0, 5)}</span>
                      </div>
                      <StatusBadge status={appointment.status} />
                    </div>
                    <div className="client-appointment-meta">
                      <span>Profissional: <strong>{appointment.barber_name}</strong></span>
                      <span>Valor: <strong>{formatMoney(appointment.price)}</strong></span>
                      <span className={`payment-pill inline ${getPaymentStatusClass(appointment.payment_status)}`}>{getPaymentStatusLabel(appointment.payment_status)} {Number(appointment.payment_amount || 0) > 0 ? `• ${formatMoney(appointment.payment_amount)}` : ''}</span>
                    </div>
                    {appointment.notes && <p className="appointment-notes">{appointment.notes}</p>}
                    {canClientCancel(appointment) && <button className="btn danger full" type="button" onClick={() => cancelAppointment(appointment)}><XCircle size={16} /> Cancelar agendamento</button>}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
