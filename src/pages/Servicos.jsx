import { useState } from 'react'
import { Plus } from 'lucide-react'
import Modal from '../components/Modal'
import { saveService } from '../lib/api'
import { formatMoney } from '../lib/dates'

export default function Servicos({ session, bootstrap, showToast, refreshBootstrap, pageParams }) {
  const services = bootstrap?.services_all || bootstrap?.services || []
  const guidedFocus = pageParams?.source === 'activation'
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ id: '', name: '', durationMin: 30, price: 0, active: true })
  const [saving, setSaving] = useState(false)

  function openNew() {
    setForm({ id: '', name: '', durationMin: 30, price: 0, active: true })
    setModalOpen(true)
  }

  function openEdit(service) {
    setForm({ id: service.id, name: service.name, durationMin: service.duration_min, price: service.price, active: service.active })
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await saveService(session.session_token, form)
      showToast('Serviço salvo com sucesso.')
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
          <span className="eyebrow">Catálogo</span>
          <h2>Serviços</h2>
          <p>Defina duração, valor e disponibilidade dos serviços.</p>
        </div>
        <button className="btn primary" onClick={openNew} type="button"><Plus size={17} /> Novo serviço</button>
      </div>

      {guidedFocus && (
        <div className="guided-focus-note">
          <Plus size={17} />
          <span>Etapa do checklist: <strong>{pageParams?.title || 'Serviços e preços'}</strong>. Cadastre pelo menos um serviço ativo com preço.</span>
        </div>
      )}

      <div className="list-grid service-grid">
        {services.length === 0 && (
          <div className="empty-state onboarding-empty">
            <strong>Monte o cardápio de serviços</strong>
            <span>Comece por Corte, Barba ou Corte + Barba, com duração e valor. Esses serviços aparecem no link público.</span>
            <button className="btn primary" type="button" onClick={openNew}><Plus size={17} /> Criar primeiro serviço</button>
          </div>
        )}
        {services.map((service) => (
          <button type="button" className={`data-card ${!service.active ? 'inactive' : ''}`} key={service.id} onClick={() => openEdit(service)}>
            <div>
              <h3>{service.name}</h3>
              <p>{service.duration_min} minutos</p>
            </div>
            <div className="data-meta right">
              <strong>{formatMoney(service.price)}</strong>
              <small>{service.active ? 'Ativo' : 'Inativo'}</small>
            </div>
          </button>
        ))}
      </div>

      <Modal open={modalOpen} title={form.id ? 'Editar serviço' : 'Novo serviço'} onClose={() => setModalOpen(false)} footer={<><button className="btn soft" type="button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="btn primary" type="submit" form="service-form" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button></>}>
        <form id="service-form" onSubmit={handleSave} className="form-grid">
          <label className="full"><span>Nome do serviço</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label><span>Duração em minutos</span><input type="number" min="5" step="5" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} required /></label>
          <label><span>Valor</span><input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></label>
          <label className="check-row full"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Serviço ativo</label>
        </form>
      </Modal>
    </section>
  )
}
