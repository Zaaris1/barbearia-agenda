import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, CalendarCheck, CalendarDays, CheckCircle2, Clock3, Copy, CreditCard, Instagram, MapPin, MessageCircle, QrCode, Scissors, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { publicCreateAppointment, publicGetAvailableSlots, publicGetShop } from '../lib/api'
import { formatMoney, todayISO } from '../lib/dates'
import { applyDocumentBrand, buildThemeStyle, instagramUrl, normalizeUrl, whatsappLink } from '../lib/branding'
import { buildPixPayload, calculatePaymentAmount, getPaymentModeLabel, pixQrCodeUrl, shouldShowPayment } from '../lib/pix'

function extractSlug() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  const index = parts.indexOf('agendar')
  if (index >= 0 && parts[index + 1]) return parts[index + 1]
  return import.meta.env.VITE_DEFAULT_SHOP_SLUG || 'barbearia-demo'
}

export default function PublicBooking({ showToast }) {
  const [slug] = useState(extractSlug())
  const [shop, setShop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slots, setSlots] = useState([])
  const [done, setDone] = useState(null)
  const [form, setForm] = useState({ serviceId: '', barberId: '', date: todayISO(), startTime: '', clientName: '', clientPhone: '', notes: '' })

  const services = shop?.services || []
  const barbers = shop?.barbers || []
  const selectedService = useMemo(() => services.find((s) => s.id === form.serviceId), [services, form.serviceId])
  const selectedBarber = useMemo(() => barbers.find((b) => b.id === form.barberId), [barbers, form.barberId])
  const paymentAmountPreview = useMemo(() => calculatePaymentAmount(shop || {}, selectedService?.price || 0), [shop, selectedService])
  const paymentVisiblePreview = shouldShowPayment(shop || {}, paymentAmountPreview)
  const canSubmit = form.serviceId && form.barberId && form.date && form.startTime && form.clientName.trim() && form.clientPhone.trim()
  const logoUrl = normalizeUrl(shop?.logo_url)
  const coverUrl = normalizeUrl(shop?.cover_url)
  const themeStyle = buildThemeStyle(shop || {})
  const instagramHref = instagramUrl(shop?.instagram)

  async function copyText(text, label = 'Copiado com sucesso.') {
    try {
      await navigator.clipboard.writeText(text)
      showToast(label)
    } catch {
      showToast('Não foi possível copiar automaticamente. Copie manualmente.', 'error')
    }
  }

  async function loadShop() {
    setLoading(true)
    try {
      const data = await publicGetShop(slug)
      setShop(data)
      applyDocumentBrand(data)
      if (data?.services?.length === 1) setForm((old) => ({ ...old, serviceId: data.services[0].id }))
      if (data?.barbers?.length === 1) setForm((old) => ({ ...old, barberId: data.barbers[0].id }))
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadSlots() {
    if (!form.serviceId || !form.barberId || !form.date) {
      setSlots([])
      return
    }
    setSlotsLoading(true)
    setForm((old) => ({ ...old, startTime: '' }))
    try {
      setSlots(await publicGetAvailableSlots(slug, form.serviceId, form.barberId, form.date))
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSlotsLoading(false)
    }
  }

  useEffect(() => { loadShop() }, [slug])
  useEffect(() => { loadSlots() }, [form.serviceId, form.barberId, form.date])

  async function submit(e) {
    e.preventDefault()
    try {
      if (!form.startTime) throw new Error('Escolha um horário disponível.')
      const result = await publicCreateAppointment(slug, form)
      setDone(result)
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  if (done) {
    const paymentAmount = Number(done.payment_amount || calculatePaymentAmount(shop || {}, done.price || selectedService?.price || 0))
    const showPayment = shouldShowPayment(shop || {}, paymentAmount)
    const pixPayload = showPayment ? buildPixPayload({
      pixKey: shop?.pix_key,
      pixKeyType: shop?.pix_key_type,
      receiverName: shop?.pix_receiver_name || shop?.name,
      receiverCity: shop?.pix_receiver_city || 'BRASIL',
      amount: paymentAmount,
      txid: done.payment_reference || `AG${String(done.id || '').replace(/-/g, '').slice(0, 18)}`,
      description: 'AGENDAMENTO',
    }) : ''

    const baseText = `Olá! Solicitei um horário pelo app: ${done.service_name}, dia ${done.date} às ${done.start_time?.slice(0, 5)} com ${done.barber_name}.`
    const paymentText = showPayment ? `\n\nPagamento Pix: ${formatMoney(paymentAmount)}. Vou enviar o comprovante por aqui.` : ''
    const wa = whatsappLink(shop?.phone, `${baseText}${paymentText}`)

    return (
      <div className="public-page public-page-pro branded-public payment-result-page" style={themeStyle}>
        <motion.div className="public-card success-card payment-success-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="success-icon"><CheckCircle2 size={42} /></div>
          <span className="eyebrow centered">Solicitação enviada</span>
          <h1>Seu horário foi solicitado</h1>
          <p>A barbearia recebeu seu pedido. Aguarde a confirmação pelo WhatsApp antes de considerar o horário confirmado.</p>
          <div className="booking-summary">
            <span><CalendarDays size={16} /> {done.date} às {done.start_time?.slice(0, 5)}</span>
            <span><Scissors size={16} /> {done.service_name}</span>
            <span><UserRound size={16} /> {done.barber_name}</span>
            <span><CreditCard size={16} /> {formatMoney(done.price || selectedService?.price || 0)}</span>
          </div>

          {showPayment && (
            <div className="payment-box-public">
              <div className="payment-box-heading">
                <div>
                  <span className="eyebrow">Pagamento Pix</span>
                  <h2>{done.payment_required ? 'Envie o Pix para reservar' : 'Pagamento Pix disponível'}</h2>
                </div>
                <strong>{formatMoney(paymentAmount)}</strong>
              </div>
              <p>{shop?.payment_instructions || (done.payment_required ? 'Para agilizar a confirmação, faça o Pix e envie o comprovante pelo WhatsApp.' : 'Você pode pagar agora via Pix ou combinar diretamente com a barbearia.')}</p>

              {pixPayload && <div className="qr-box pix-qr"><img src={pixQrCodeUrl(pixPayload)} alt="QR Code Pix" /></div>}

              <div className="pix-copy-box pix-copy-box-v152">
                <div className="pix-copy-label">
                  <strong>Pix copia e cola</strong>
                  <small>Use o botão abaixo para copiar o código completo.</small>
                </div>
                <textarea
                  className="pix-payload-textarea"
                  value={pixPayload || shop?.pix_key || ''}
                  readOnly
                  aria-label="Pix copia e cola"
                />
                <button className="ghost-icon pix-copy-inline" type="button" onClick={() => copyText(pixPayload || shop?.pix_key, 'Pix copiado.')} title="Copiar Pix"><Copy size={17} /></button>
              </div>

              <div className="payment-actions-public">
                {pixPayload && <button className="btn soft full" type="button" onClick={() => copyText(pixPayload, 'Pix copia e cola copiado.')}><QrCode size={17} /> Copiar Pix copia e cola</button>}
                <button className="btn soft full" type="button" onClick={() => copyText(shop?.pix_key, 'Chave Pix copiada.')}><Copy size={17} /> Copiar chave Pix</button>
              </div>
            </div>
          )}

          {wa && <a className="btn success full" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Enviar comprovante / mensagem</a>}
          <button className="btn primary full" type="button" onClick={() => { setDone(null); setForm((old) => ({ ...old, startTime: '' })); loadSlots(); }}>
            Fazer outro agendamento
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="public-page public-page-pro branded-public payment-result-page" style={themeStyle}>
      <div className="public-orb one" />
      <div className="public-orb two" />

      <motion.div className="public-layout public-layout-v13" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <aside className="public-hero-card public-hero-v13" style={{ backgroundImage: coverUrl ? `linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.86)), url(${coverUrl})` : undefined }}>
          <button className="public-back" type="button" onClick={() => window.location.href = '/'}><ArrowLeft size={16} /> Painel interno</button>
          <div className={`public-logo ${logoUrl ? 'with-image' : ''}`}>
            {logoUrl ? <img src={logoUrl} alt={`Logo ${shop?.name || 'Barbearia'}`} /> : <Scissors size={34} />}
          </div>
          <span className="eyebrow">Agendamento online</span>
          <h1>{loading ? 'Carregando...' : shop?.name || 'Barbearia'}</h1>
          <p>{shop?.slogan || 'Escolha serviço, profissional e horário disponível. O pedido entra para confirmação da barbearia.'}</p>

          <div className="public-feature-list">
            <div><Sparkles size={18} /><span>Atendimento organizado</span></div>
            <div><Clock3 size={18} /><span>Horários calculados automaticamente</span></div>
            <div><ShieldCheck size={18} /><span>Confirmação pelo painel interno</span></div>
            {shop?.payment_enabled && shop?.payment_mode !== 'DISABLED' && <div><CreditCard size={18} /><span>{getPaymentModeLabel(shop.payment_mode)}</span></div>}
            {shop?.opening_hours_text && <div><CalendarDays size={18} /><span>{shop.opening_hours_text}</span></div>}
            {shop?.address && <div><MapPin size={18} /><span>{shop.address}</span></div>}
          </div>

          <div className="public-social-row">
            {shop?.phone && <a href={whatsappLink(shop.phone, `Olá! Vim pelo link de agendamento da ${shop?.name || 'barbearia'}.`)} target="_blank" rel="noreferrer"><MessageCircle size={16} /> WhatsApp</a>}
            {instagramHref && <a href={instagramHref} target="_blank" rel="noreferrer"><Instagram size={16} /> Instagram</a>}
          </div>
        </aside>

        <main className="public-card public-form-card public-form-card-v13">
          <span className="eyebrow centered">Solicitar horário</span>
          <h2>Monte seu agendamento</h2>
          <p>Preencha os dados abaixo. O horário só fica confirmado após retorno da barbearia.</p>

          <div className="public-service-cards">
            {services.slice(0, 6).map((service) => (
              <button
                key={service.id}
                type="button"
                className={form.serviceId === service.id ? 'active' : ''}
                onClick={() => setForm({ ...form, serviceId: service.id })}
              >
                <strong>{service.name}</strong>
                <span>{service.duration_min}min • {formatMoney(service.price)}</span>
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="form-stack public-form">
            <label>
              <span>Serviço</span>
              <select value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })} required>
                <option value="">Selecione</option>
                {services.map((service) => <option value={service.id} key={service.id}>{service.name} • {service.duration_min}min • {formatMoney(service.price)}</option>)}
              </select>
            </label>
            <label>
              <span>Profissional</span>
              <select value={form.barberId} onChange={(e) => setForm({ ...form, barberId: e.target.value })} required>
                <option value="">Selecione</option>
                {barbers.map((barber) => <option value={barber.id} key={barber.id}>{barber.name}</option>)}
              </select>
            </label>
            <label>
              <span>Data</span>
              <input type="date" min={todayISO()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </label>

            <div className="slot-selector">
              <span>Horários disponíveis {selectedService ? `• ${selectedService.duration_min}min` : ''}</span>
              {slotsLoading && <div className="empty-state small">Buscando horários...</div>}
              {!slotsLoading && !form.serviceId && <div className="empty-state small">Escolha um serviço para começar.</div>}
              {!slotsLoading && form.serviceId && !form.barberId && <div className="empty-state small">Escolha o profissional para ver os horários.</div>}
              {!slotsLoading && form.serviceId && form.barberId && slots.length === 0 && <div className="empty-state small">Nenhum horário livre encontrado para esta data.</div>}
              <div className="slot-buttons">
                {slots.map((slot) => (
                  <button type="button" className={form.startTime === slot.start_time ? 'active' : ''} key={slot.start_time} onClick={() => setForm({ ...form, startTime: slot.start_time })}>
                    {slot.start_time}
                  </button>
                ))}
              </div>
            </div>

            <label><span>Seu nome</span><input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} required /></label>
            <label><span>WhatsApp</span><input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} placeholder="(00) 00000-0000" required /></label>
            <label><span>Observação opcional</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows="3" placeholder="Ex: preferência de corte, atraso previsto, referência etc." /></label>

            {(selectedService || selectedBarber || form.startTime) && (
              <div className="public-summary">
                <strong>Resumo</strong>
                <span>{selectedService ? `${selectedService.name} • ${selectedService.duration_min}min • ${formatMoney(selectedService.price)}` : 'Serviço não selecionado'}</span>
                <span>{selectedBarber ? `Com ${selectedBarber.name}` : 'Profissional não selecionado'}</span>
                <span>{form.startTime ? `${form.date} às ${form.startTime}` : 'Horário não selecionado'}</span>
                {paymentVisiblePreview && <span>Pix: {getPaymentModeLabel(shop?.payment_mode)} • {formatMoney(paymentAmountPreview)}</span>}
              </div>
            )}

            <button className="btn primary full" type="submit" disabled={!canSubmit}><CalendarCheck size={18} /> Solicitar agendamento</button>
          </form>
        </main>
      </motion.div>
    </div>
  )
}
