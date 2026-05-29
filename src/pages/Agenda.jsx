import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, RefreshCcw } from 'lucide-react'
import AppointmentCard from '../components/AppointmentCard'
import Modal from '../components/Modal'
import { createAppointment, listAppointments, listClients, markAppointmentPaid, rescheduleAppointment, updateAppointmentStatus } from '../lib/api'
import { todayISO } from '../lib/dates'
import { openWhatsappConfirmation } from '../lib/whatsapp'

const statusOptions = [
  { value: '', label: 'Todos os status' },
  { value: 'PENDENTE_CONFIRMACAO', label: 'Pendente' },
  { value: 'AGENDADO', label: 'Agendado' },
  { value: 'CONFIRMADO', label: 'Confirmado' },
  { value: 'EM_ATENDIMENTO', label: 'Em atendimento' },
  { value: 'CONCLUIDO', label: 'Concluído' },
  { value: 'CANCELADO', label: 'Cancelado' },
  { value: 'FALTOU', label: 'Faltou' },
]

function initialForm(date) {
  return {
    clientId: '',
    clientName: '',
    clientPhone: '',
    barberId: '',
    serviceId: '',
    date,
    startTime: '',
    notes: '',
    status: 'AGENDADO',
  }
}

export default function Agenda({ session, bootstrap, showToast, refreshBootstrap }) {
  const [date, setDate] = useState(todayISO())
  const [barberId, setBarberId] = useState('')
  const [status, setStatus] = useState('')
  const [appointments, setAppointments] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [form, setForm] = useState(initialForm(date))
  const [saving, setSaving] = useState(false)

  const barbers = bootstrap?.barbers || []
  const services = bootstrap?.services || []

  const selectedService = useMemo(() => services.find((s) => s.id === form.serviceId), [services, form.serviceId])

  async function load() {
    setLoading(true)
    try {
      const data = await listAppointments(session.session_token, { date, barberId, status })
      setAppointments(data)
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadClients() {
    try {
      const data = await listClients(session.session_token, '')
      setClients(data)
    } catch {
      setClients([])
    }
  }

  useEffect(() => {
    load()
  }, [date, barberId, status])

  useEffect(() => {
    loadClients()
  }, [])

  function openCreateModal() {
    setRescheduleTarget(null)
    setForm(initialForm(date))
    setModalOpen(true)
  }

  function openRescheduleModal(appointment) {
    setRescheduleTarget(appointment)
    setForm({ ...initialForm(appointment.date), date: appointment.date, startTime: appointment.start_time?.slice(0, 5) })
    setModalOpen(true)
  }

  function handleClientSelect(clientId) {
    const client = clients.find((c) => c.id === clientId)
    if (!client) {
      setForm((old) => ({ ...old, clientId: '', clientName: '', clientPhone: '' }))
      return
    }
    setForm((old) => ({ ...old, clientId, clientName: client.name, clientPhone: client.phone || '' }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (rescheduleTarget) {
        await rescheduleAppointment(session.session_token, rescheduleTarget.id, form.date, form.startTime)
        showToast('Agendamento remarcado com sucesso.')
      } else {
        await createAppointment(session.session_token, form)
        showToast('Agendamento criado com sucesso.')
      }
      setModalOpen(false)
      await Promise.all([load(), loadClients(), refreshBootstrap?.()])
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleSendConfirmation(appointment) {
    const opened = openWhatsappConfirmation(appointment, bootstrap?.barbershop || session?.barbershop || {})

    if (!opened) {
      showToast('Este cliente não tem WhatsApp cadastrado.', 'error')
      return
    }

    showToast('Mensagem de confirmação aberta no WhatsApp.')
  }

  async function handleStatus(appointmentOrId, newStatus) {
    const appointment = typeof appointmentOrId === 'object' ? appointmentOrId : appointments.find((item) => item.id === appointmentOrId)
    const appointmentId = appointment?.id || appointmentOrId
    const note = ['CANCELADO', 'FALTOU'].includes(newStatus) ? window.prompt('Observação opcional:') || '' : ''

    try {
      await updateAppointmentStatus(session.session_token, appointmentId, newStatus, note)
      showToast('Status atualizado.')

      if (newStatus === 'CONFIRMADO' && appointment) {
        window.setTimeout(() => handleSendConfirmation({ ...appointment, status: 'CONFIRMADO' }), 250)
      }

      await load()
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  async function handleMarkPaid(appointment) {
    const note = window.prompt('Observação do pagamento opcional:', appointment.payment_note || '') || ''
    try {
      await markAppointmentPaid(session.session_token, appointment.id, note)
      showToast('Pagamento marcado como recebido.')
      await load()
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Operação diária</span>
          <h2>Agenda</h2>
          <p>Gerencie horários, status e remarcações do balcão.</p>
        </div>
        <div className="heading-actions">
          <button className="btn soft" type="button" onClick={load}><RefreshCcw size={17} /> Atualizar</button>
          <button className="btn primary" type="button" onClick={openCreateModal}><CalendarPlus size={17} /> Novo</button>
        </div>
      </div>

      <div className="filters-card">
        <label><span>Data</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label><span>Barbeiro</span><select value={barberId} onChange={(e) => setBarberId(e.target.value)}><option value="">Todos</option>{barbers.map((b) => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
        <label><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}>{statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      </div>

      {loading && <div className="loading-card">Carregando agenda...</div>}
      {!loading && appointments.length === 0 && <div className="empty-state big">Nenhum agendamento encontrado para os filtros selecionados.</div>}
      <div className="appointments-grid">
        {appointments.map((appointment) => (
          <AppointmentCard key={appointment.id} appointment={appointment} onStatus={handleStatus} onReschedule={openRescheduleModal} onMarkPaid={handleMarkPaid} onSendConfirmation={handleSendConfirmation} />
        ))}
      </div>

      <Modal
        open={modalOpen}
        title={rescheduleTarget ? 'Remarcar agendamento' : 'Novo agendamento'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn soft" type="button" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn primary" type="submit" form="appointment-form" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </>
        }
      >
        <form id="appointment-form" onSubmit={handleSave} className="form-grid">
          {!rescheduleTarget && (
            <>
              <label className="full"><span>Cliente existente</span><select value={form.clientId} onChange={(e) => handleClientSelect(e.target.value)}><option value="">Novo cliente / digitar manualmente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>)}</select></label>
              <label><span>Nome do cliente</span><input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} required /></label>
              <label><span>WhatsApp</span><input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} placeholder="(00) 00000-0000" /></label>
              <label><span>Barbeiro</span><select value={form.barberId} onChange={(e) => setForm({ ...form, barberId: e.target.value })} required><option value="">Selecione</option>{barbers.map((b) => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
              <label><span>Serviço</span><select value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })} required><option value="">Selecione</option>{services.map((s) => <option value={s.id} key={s.id}>{s.name} • {s.duration_min}min</option>)}</select></label>
            </>
          )}
          {rescheduleTarget && <div className="notice full">Remarcando: <strong>{rescheduleTarget.client_name}</strong> • {rescheduleTarget.service_name}</div>}
          <label><span>Data</span><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
          <label><span>Horário</span><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required /></label>
          {!rescheduleTarget && <label><span>Status inicial</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="AGENDADO">Agendado</option><option value="CONFIRMADO">Confirmado</option></select></label>}
          {!rescheduleTarget && <label className="full"><span>Observação</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows="3" /></label>}
          {selectedService && <div className="notice full">Duração calculada: <strong>{selectedService.duration_min} minutos</strong> • Valor: <strong>R$ {Number(selectedService.price).toFixed(2).replace('.', ',')}</strong></div>}
        </form>
      </Modal>
    </section>
  )
}
