import { useState } from 'react'
import { Percent, Plus, WalletCards } from 'lucide-react'
import Modal from '../components/Modal'
import { saveBarber } from '../lib/api'
import { formatMoney } from '../lib/dates'
import { formatPhoneInput } from '../lib/formatters'

const days = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']

const emptyForm = {
  id: '',
  name: '',
  phone: '',
  active: true,
  role: 'BARBER',
  pin: '',
  startTime: '08:00',
  endTime: '19:00',
  daysWorking: ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'],
  serviceIds: [],
  color: '#d4a857',
  commissionEnabled: false,
  commissionType: 'PERCENT',
  commissionValue: 0,
}

function commissionLabel(barber) {
  if (!barber?.commission_enabled) return 'Sem comissão'
  if (barber.commission_type === 'FIXED') return `${formatMoney(barber.commission_value || 0)} por atendimento`
  return `${Number(barber.commission_value || 0).toFixed(2).replace('.', ',')}% dos concluídos`
}

function roleLabel(role) {
  const labels = { ADMIN: 'Gestor', BARBER: 'Profissional', ATTENDANT: 'Atendente' }
  return labels[role] || 'Profissional'
}

export default function Barbeiros({ session, bootstrap, showToast, refreshBootstrap, pageParams }) {
  const barbers = bootstrap?.barbers_all || bootstrap?.barbers || []
  const services = bootstrap?.services_all || bootstrap?.services || []
  const guidedFocus = pageParams?.source === 'activation'
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  function openNew() {
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(barber) {
    setForm({
      id: barber.id,
      name: barber.name,
      phone: barber.phone || '',
      active: barber.active,
      role: barber.role || 'BARBER',
      pin: '',
      startTime: barber.start_time?.slice(0, 5) || '08:00',
      endTime: barber.end_time?.slice(0, 5) || '19:00',
      daysWorking: barber.days_working || [],
      serviceIds: barber.service_ids || [],
      color: barber.color || '#d4a857',
      commissionEnabled: barber.commission_enabled === true,
      commissionType: barber.commission_type || 'PERCENT',
      commissionValue: Number(barber.commission_value || 0),
    })
    setModalOpen(true)
  }

  function toggleDay(day) {
    setForm((old) => ({ ...old, daysWorking: old.daysWorking.includes(day) ? old.daysWorking.filter((d) => d !== day) : [...old.daysWorking, day] }))
  }

  function toggleService(serviceId) {
    setForm((old) => ({ ...old, serviceIds: old.serviceIds.includes(serviceId) ? old.serviceIds.filter((id) => id !== serviceId) : [...old.serviceIds, serviceId] }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await saveBarber(session.session_token, form)
      showToast('Profissional salvo com sucesso.')
      setModalOpen(false)
      await refreshBootstrap()
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Equipe</span>
          <h2>Profissionais</h2>
          <p>Controle PIN, horários, serviços e comissão de cada profissional.</p>
        </div>
        <button className="btn primary" onClick={openNew} type="button"><Plus size={17} /> Novo profissional</button>
      </div>

      {guidedFocus && (
        <div className="guided-focus-note">
          <Plus size={17} />
          <span>Etapa do checklist: <strong>{pageParams?.title || 'Equipe de atendimento'}</strong>. Deixe pelo menos um profissional ativo com dias e horários definidos.</span>
        </div>
      )}

      <div className="list-grid">
        {barbers.length === 0 && (
          <div className="empty-state onboarding-empty">
            <strong>Cadastre quem atende clientes</strong>
            <span>Se o dono também atende, cadastre-o como profissional ou gestor ativo, com jornada e serviços vinculados.</span>
            <button className="btn primary" type="button" onClick={openNew}><Plus size={17} /> Criar primeiro profissional</button>
          </div>
        )}
        {barbers.map((barber) => (
          <button type="button" className={`data-card barber-card ${!barber.active ? 'inactive' : ''}`} key={barber.id} onClick={() => openEdit(barber)}>
            <div className="barber-avatar" style={{ '--barber-color': barber.color || '#d4a857' }}>{barber.name?.slice(0, 1)}</div>
            <div>
              <h3>{barber.name}</h3>
              <p>{barber.phone || 'Sem telefone'}</p>
              <small className="commission-card-hint"><WalletCards size={13} /> {commissionLabel(barber)}</small>
            </div>
            <div className="data-meta right">
              <span>{roleLabel(barber.role)}</span>
              <small>{barber.active ? 'Ativo' : 'Inativo'}</small>
            </div>
          </button>
        ))}
      </div>

      <Modal open={modalOpen} title={form.id ? 'Editar profissional' : 'Novo profissional'} onClose={() => setModalOpen(false)} footer={<><button className="btn soft" type="button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="btn primary" type="submit" form="barber-form" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button></>}>
        <form id="barber-form" onSubmit={handleSave} className="form-grid">
          <label><span>Nome</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label><span>WhatsApp</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })} placeholder="(00) 00000-0000" /></label>
          <label><span>Perfil</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="BARBER">Profissional</option><option value="ADMIN">Gestor</option></select></label>
          <label><span>PIN {form.id ? '(preencha só para alterar)' : ''}</span><input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} type="password" inputMode="numeric" required={!form.id} /></label>
          <label><span>Início</span><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
          <label><span>Fim</span><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label>
          <label><span>Cor</span><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label>
          <label className="check-row"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo</label>

          <div className="full commission-settings-box">
            <div className="panel-title compact">
              <h3><Percent size={16} /> Comissão do profissional</h3>
              <span>{form.commissionEnabled ? 'Ativada' : 'Desativada'}</span>
            </div>
            <div className="form-grid compact-form-grid">
              <label className="check-row"><input type="checkbox" checked={form.commissionEnabled} onChange={(e) => setForm({ ...form, commissionEnabled: e.target.checked })} /> Calcular comissão para este profissional</label>
              <label><span>Tipo de comissão</span><select value={form.commissionType} onChange={(e) => setForm({ ...form, commissionType: e.target.value })}><option value="PERCENT">Percentual (%)</option><option value="FIXED">Valor fixo por atendimento</option></select></label>
              <label><span>{form.commissionType === 'FIXED' ? 'Valor fixo' : 'Percentual'}</span><input type="number" min="0" max={form.commissionType === 'PERCENT' ? '100' : undefined} step="0.01" value={form.commissionValue} onChange={(e) => setForm({ ...form, commissionValue: e.target.value })} /></label>
            </div>
            <p className="muted-note">A comissão é calculada apenas sobre atendimentos concluídos no relatório financeiro.</p>
          </div>

          <div className="full chip-group"><span>Dias de trabalho</span>{days.map((day) => <button type="button" key={day} className={form.daysWorking.includes(day) ? 'chip active' : 'chip'} onClick={() => toggleDay(day)}>{day}</button>)}</div>
          <div className="full chip-group"><span>Serviços que realiza</span>{services.map((service) => <button type="button" key={service.id} className={form.serviceIds.includes(service.id) ? 'chip active' : 'chip'} onClick={() => toggleService(service.id)}>{service.name}</button>)}</div>
        </form>
      </Modal>
    </section>
  )
}
