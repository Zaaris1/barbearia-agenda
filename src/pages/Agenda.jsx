import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, CalendarX2, RefreshCcw, Trash2 } from 'lucide-react'
import AppointmentCard from '../components/AppointmentCard'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import PromptModal from '../components/PromptModal'
import {
  createAppointment,
  deleteScheduleBlock,
  listAppointments,
  listClients,
  listScheduleBlocks,
  markAppointmentPaid,
  rescheduleAppointment,
  saveScheduleBlock,
  updateAppointmentStatus,
} from '../lib/api'
import { todayISO } from '../lib/dates'
import { openWhatsappCancellation, openWhatsappConfirmation, openWhatsappReminder } from '../lib/whatsapp'
import { formatPhoneInput } from '../lib/formatters'

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

const blockTypes = [
  { value: 'BLOQUEIO', label: 'Bloqueio manual' },
  { value: 'FOLGA', label: 'Folga' },
  { value: 'ALMOCO', label: 'Almoço' },
  { value: 'PAUSA', label: 'Pausa' },
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

function initialBlockForm(date, barberId = '') {
  return {
    barberId,
    date,
    startTime: '12:00',
    endTime: '13:00',
    blockType: 'ALMOCO',
    allDay: false,
    reason: '',
  }
}

function blockTypeLabel(type) {
  return blockTypes.find((item) => item.value === type)?.label || type || 'Bloqueio'
}

export default function Agenda({ session, bootstrap, showToast, refreshBootstrap }) {
  const [date, setDate] = useState(todayISO())
  const [barberId, setBarberId] = useState('')
  const [status, setStatus] = useState('')
  const [appointments, setAppointments] = useState([])
  const [clients, setClients] = useState([])
  const [scheduleBlocks, setScheduleBlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [blocksLoading, setBlocksLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [form, setForm] = useState(initialForm(date))
  const [blockForm, setBlockForm] = useState(initialBlockForm(date, barberId))
  const [saving, setSaving] = useState(false)
  const [savingBlock, setSavingBlock] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [promptAction, setPromptAction] = useState(null)

  const allBarbers = bootstrap?.barbers || []
  const role = session?.user?.role || 'BARBER'
  const canManageAllBarbers = role === 'ADMIN' || role === 'ATTENDANT'
  const barbers = useMemo(() => (
    canManageAllBarbers ? allBarbers : allBarbers.filter((barber) => barber.user_id === session?.user?.id)
  ), [allBarbers, canManageAllBarbers, session?.user?.id])
  const services = bootstrap?.services || []
  const shop = bootstrap?.barbershop || session?.barbershop || {}
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

  async function loadBlocks() {
    setBlocksLoading(true)
    try {
      const data = await listScheduleBlocks(session.session_token, { date, barberId })
      setScheduleBlocks(data)
    } catch (error) {
      showToast(error.message, 'error')
      setScheduleBlocks([])
    } finally {
      setBlocksLoading(false)
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
    loadBlocks()
  }, [date, barberId, status])

  useEffect(() => {
    loadClients()
  }, [])

  useEffect(() => {
    if (canManageAllBarbers) return
    const ownBarberId = barbers[0]?.id || ''
    if (barberId !== ownBarberId) setBarberId(ownBarberId)
  }, [barberId, barbers, canManageAllBarbers])

  function openCreateModal() {
    setRescheduleTarget(null)
    setForm({ ...initialForm(date), barberId: canManageAllBarbers ? '' : barbers[0]?.id || '' })
    setModalOpen(true)
  }

  function openBlockModal() {
    setBlockForm(initialBlockForm(date, canManageAllBarbers ? barberId : barbers[0]?.id || ''))
    setBlockModalOpen(true)
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
      await Promise.all([load(), loadBlocks(), loadClients(), refreshBootstrap?.()])
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveBlock(e) {
    e.preventDefault()
    setSavingBlock(true)
    try {
      await saveScheduleBlock(session.session_token, blockForm)
      showToast('Bloqueio/pausa salvo com sucesso.')
      setBlockModalOpen(false)
      await Promise.all([load(), loadBlocks(), refreshBootstrap?.()])
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSavingBlock(false)
    }
  }

  async function confirmDeleteBlock(block) {
    try {
      await deleteScheduleBlock(session.session_token, block.id)
      showToast('Bloqueio removido.')
      await Promise.all([load(), loadBlocks(), refreshBootstrap?.()])
      setConfirmAction(null)
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  function handleDeleteBlock(block) {
    setConfirmAction({
      title: 'Remover bloqueio?',
      message: `Esta ação libera o horário de ${block.start_time} a ${block.end_time}.`,
      confirmLabel: 'Remover',
      tone: 'danger',
      onConfirm: () => confirmDeleteBlock(block),
    })
  }

  function handleSendConfirmation(appointment) {
    const opened = openWhatsappConfirmation(appointment, shop)
    if (!opened) return showToast('Este cliente não tem WhatsApp cadastrado.', 'error')
    showToast('Mensagem de confirmação aberta no WhatsApp.')
  }

  function handleSendReminder(appointment) {
    const opened = openWhatsappReminder(appointment, shop)
    if (!opened) return showToast('Este cliente não tem WhatsApp cadastrado.', 'error')
    showToast('Mensagem de lembrete aberta no WhatsApp.')
  }

  function handleSendCancellation(appointment) {
    const opened = openWhatsappCancellation(appointment, shop)
    if (!opened) return showToast('Este cliente não tem WhatsApp cadastrado.', 'error')
    showToast('Mensagem de cancelamento aberta no WhatsApp.')
  }

  async function updateStatusWithNote(appointmentOrId, newStatus, note = '') {
    const appointment = typeof appointmentOrId === 'object' ? appointmentOrId : appointments.find((item) => item.id === appointmentOrId)
    const appointmentId = appointment?.id || appointmentOrId

    try {
      await updateAppointmentStatus(session.session_token, appointmentId, newStatus, note)
      showToast('Status atualizado.')

      if (newStatus === 'CONFIRMADO' && appointment) {
        window.setTimeout(() => handleSendConfirmation({ ...appointment, status: 'CONFIRMADO' }), 250)
      }

      if (newStatus === 'CANCELADO' && appointment) {
        window.setTimeout(() => handleSendCancellation({ ...appointment, status: 'CANCELADO' }), 250)
      }

      await load()
      return true
    } catch (error) {
      showToast(error.message, 'error')
      return false
    }
  }

  function handleStatus(appointmentOrId, newStatus) {
    if (!['CANCELADO', 'FALTOU'].includes(newStatus)) {
      updateStatusWithNote(appointmentOrId, newStatus)
      return
    }

    setPromptAction({
      title: newStatus === 'CANCELADO' ? 'Cancelar agendamento' : 'Marcar falta',
      label: 'Observação opcional',
      placeholder: newStatus === 'CANCELADO' ? 'Ex: cliente pediu cancelamento pelo WhatsApp.' : 'Ex: cliente não compareceu.',
      confirmLabel: 'Atualizar status',
      onConfirm: async (note) => {
        const ok = await updateStatusWithNote(appointmentOrId, newStatus, note)
        if (ok) setPromptAction(null)
      },
    })
  }

  async function markPaidWithNote(appointment, note = '') {
    try {
      await markAppointmentPaid(session.session_token, appointment.id, note)
      showToast('Pagamento marcado como recebido.')
      await load()
      return true
    } catch (error) {
      showToast(error.message, 'error')
      return false
    }
  }

  function handleMarkPaid(appointment) {
    setPromptAction({
      title: 'Marcar pagamento recebido',
      label: 'Observação do pagamento',
      defaultValue: appointment.payment_note || '',
      placeholder: 'Ex: Pix recebido no balcão.',
      confirmLabel: 'Marcar recebido',
      onConfirm: async (note) => {
        const ok = await markPaidWithNote(appointment, note)
        if (ok) setPromptAction(null)
      },
    })
  }

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Operação diária</span>
          <h2>Agenda</h2>
          <p>Gerencie horários, status, remarcações, folgas, almoço, pausas e bloqueios manuais.</p>
        </div>
        <div className="heading-actions">
          <button className="btn soft" type="button" onClick={() => { load(); loadBlocks() }}><RefreshCcw size={17} /> Atualizar</button>
          <button className="btn soft" type="button" onClick={openBlockModal}><CalendarX2 size={17} /> Bloquear</button>
          <button className="btn primary" type="button" onClick={openCreateModal}><CalendarPlus size={17} /> Novo</button>
        </div>
      </div>

      <div className="filters-card">
        <label><span>Data</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label><span>Profissional</span><select value={barberId} onChange={(e) => setBarberId(e.target.value)}>{canManageAllBarbers && <option value="">Todos</option>}{barbers.map((b) => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
        <label><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}>{statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      </div>

      <div className="schedule-blocks-panel">
        <div className="panel-title compact-title">
          <h3>Folgas, pausas e bloqueios do dia</h3>
          <span>{blocksLoading ? 'Carregando...' : `${scheduleBlocks.length} registro(s)`}</span>
        </div>
        {scheduleBlocks.length === 0 ? (
          <div className="empty-state small">Nenhuma pausa, almoço, folga ou bloqueio para esta data.</div>
        ) : (
          <div className="schedule-blocks-list">
            {scheduleBlocks.map((block) => (
              <div className={`schedule-block-pill ${String(block.block_type || '').toLowerCase()}`} key={block.id}>
                <div>
                  <strong>{blockTypeLabel(block.block_type)}</strong>
                  <span>{block.barber_name} • {block.start_time} - {block.end_time}</span>
                  {block.reason && <small>{block.reason}</small>}
                </div>
                <button type="button" className="ghost-icon danger" onClick={() => handleDeleteBlock(block)} title="Remover"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="loading-card">Carregando agenda...</div>}
      {!loading && appointments.length === 0 && <div className="empty-state big">Nenhum agendamento encontrado para os filtros selecionados.</div>}
      <div className="appointments-grid">
        {appointments.map((appointment) => (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            onStatus={handleStatus}
            onReschedule={openRescheduleModal}
            onMarkPaid={handleMarkPaid}
            onSendConfirmation={handleSendConfirmation}
            onSendReminder={handleSendReminder}
            onSendCancellation={handleSendCancellation}
          />
        ))}
      </div>

      <Modal
        open={blockModalOpen}
        title="Bloquear agenda / registrar pausa"
        onClose={() => setBlockModalOpen(false)}
        footer={
          <>
            <button className="btn soft" type="button" onClick={() => setBlockModalOpen(false)}>Cancelar</button>
            <button className="btn primary" type="submit" form="schedule-block-form" disabled={savingBlock}>{savingBlock ? 'Salvando...' : 'Salvar bloqueio'}</button>
          </>
        }
      >
        <form id="schedule-block-form" className="form-grid" onSubmit={handleSaveBlock}>
          <label><span>Data</span><input type="date" value={blockForm.date} onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })} required /></label>
          <label><span>Profissional</span><select value={blockForm.barberId} onChange={(e) => setBlockForm({ ...blockForm, barberId: e.target.value })}>{canManageAllBarbers && <option value="">Todos os profissionais</option>}{barbers.map((b) => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
          <label><span>Tipo</span><select value={blockForm.blockType} onChange={(e) => setBlockForm({ ...blockForm, blockType: e.target.value, allDay: e.target.value === 'FOLGA' })}>{blockTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="check-row settings-check"><input type="checkbox" checked={blockForm.allDay} onChange={(e) => setBlockForm({ ...blockForm, allDay: e.target.checked })} /><span>Dia inteiro</span></label>
          {!blockForm.allDay && blockForm.blockType !== 'FOLGA' && (
            <>
              <label><span>Início</span><input type="time" value={blockForm.startTime} onChange={(e) => setBlockForm({ ...blockForm, startTime: e.target.value })} required /></label>
              <label><span>Fim</span><input type="time" value={blockForm.endTime} onChange={(e) => setBlockForm({ ...blockForm, endTime: e.target.value })} required /></label>
            </>
          )}
          <label className="full"><span>Motivo/observação</span><textarea rows="3" value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} placeholder="Ex: Almoço, manutenção, compromisso externo, folga semanal..." /></label>
        </form>
      </Modal>

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
              <label><span>WhatsApp</span><input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: formatPhoneInput(e.target.value) })} placeholder="(00) 00000-0000" /></label>
              <label><span>Profissional</span><select value={form.barberId} onChange={(e) => setForm({ ...form, barberId: e.target.value })} required><option value="">Selecione</option>{barbers.map((b) => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
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

      <ConfirmModal
        open={Boolean(confirmAction)}
        {...(confirmAction || {})}
        onCancel={() => setConfirmAction(null)}
      />

      <PromptModal
        open={Boolean(promptAction)}
        {...(promptAction || {})}
        onCancel={() => setPromptAction(null)}
      />
    </section>
  )
}
