import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, CalendarCheck, CalendarDays, CheckCircle2, Clock3, MapPin, MessageCircle, Scissors, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { publicCreateAppointment, publicGetAvailableSlots, publicGetShop } from '../lib/api'
import { formatMoney, todayISO } from '../lib/dates'

function extractSlug() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  const index = parts.indexOf('agendar')
  if (index >= 0 && parts[index + 1]) return parts[index + 1]
  return import.meta.env.VITE_DEFAULT_SHOP_SLUG || 'barbearia-demo'
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function whatsappLink(phone, text) {
  const digits = onlyDigits(phone)
  if (!digits) return ''
  const normalized = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`
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
  const canSubmit = form.serviceId && form.barberId && form.date && form.startTime && form.clientName.trim() && form.clientPhone.trim()

  async function loadShop() {
    setLoading(true)
    try {
      const data = await publicGetShop(slug)
      setShop(data)
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
    const text = `Olá! Solicitei um horário pelo app: ${done.service_name}, dia ${done.date} às ${done.start_time?.slice(0, 5)} com ${done.barber_name}.`
    const wa = whatsappLink(shop?.phone, text)

    return (
      <div className="public-page public-page-pro">
        <motion.div className="public-card success-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="success-icon"><CheckCircle2 size={42} /></div>
          <span className="eyebrow centered">Solicitação enviada</span>
          <h1>Seu horário foi solicitado</h1>
          <p>A barbearia recebeu seu pedido. Aguarde a confirmação pelo WhatsApp antes de considerar o horário confirmado.</p>
          <div className="booking-summary">
            <span><CalendarDays size={16} /> {done.date} às {done.start_time?.slice(0, 5)}</span>
            <span><Scissors size={16} /> {done.service_name}</span>
            <span><UserRound size={16} /> {done.barber_name}</span>
          </div>
          {wa && <a className="btn success full" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Enviar mensagem no WhatsApp</a>}
          <button className="btn primary full" type="button" onClick={() => { setDone(null); setForm((old) => ({ ...old, startTime: '' })); loadSlots(); }}>
            Fazer outro agendamento
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="public-page public-page-pro">
      <div className="public-orb one" />
      <div className="public-orb two" />

      <motion.div className="public-layout" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <aside className="public-hero-card">
          <button className="public-back" type="button" onClick={() => window.location.href = '/'}><ArrowLeft size={16} /> Painel interno</button>
          <div className="public-logo"><Scissors size={34} /></div>
          <span className="eyebrow">Agendamento online</span>
          <h1>{loading ? 'Carregando...' : shop?.name || 'Barbearia'}</h1>
          <p>Escolha serviço, profissional e horário disponível. O pedido entra para confirmação da barbearia.</p>

          <div className="public-feature-list">
            <div><Sparkles size={18} /><span>Atendimento organizado</span></div>
            <div><Clock3 size={18} /><span>Horários calculados automaticamente</span></div>
            <div><ShieldCheck size={18} /><span>Confirmação pelo painel interno</span></div>
            {shop?.address && <div><MapPin size={18} /><span>{shop.address}</span></div>}
          </div>
        </aside>

        <main className="public-card public-form-card">
          <span className="eyebrow centered">Solicitar horário</span>
          <h2>Monte seu agendamento</h2>
          <p>Preencha os dados abaixo. O horário só fica confirmado após retorno da barbearia.</p>

          <form onSubmit={submit} className="form-stack public-form">
            <label>
              <span>Serviço</span>
              <select value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })} required>
                <option value="">Selecione</option>
                {services.map((service) => <option value={service.id} key={service.id}>{service.name} • {service.duration_min}min • {formatMoney(service.price)}</option>)}
              </select>
            </label>
            <label>
              <span>Barbeiro</span>
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
              {!slotsLoading && form.serviceId && !form.barberId && <div className="empty-state small">Escolha o barbeiro para ver os horários.</div>}
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
                <span>{selectedBarber ? `Com ${selectedBarber.name}` : 'Barbeiro não selecionado'}</span>
                <span>{form.startTime ? `${form.date} às ${form.startTime}` : 'Horário não selecionado'}</span>
              </div>
            )}

            <button className="btn primary full" type="submit" disabled={!canSubmit}><CalendarCheck size={18} /> Solicitar agendamento</button>
          </form>
        </main>
      </motion.div>
    </div>
  )
}
