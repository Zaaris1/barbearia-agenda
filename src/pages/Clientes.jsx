import { useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import Modal from '../components/Modal'
import { listClients, saveClient } from '../lib/api'
import { formatDateBR } from '../lib/dates'
import { formatPhoneInput } from '../lib/formatters'

export default function Clientes({ session, showToast }) {
  const [clients, setClients] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ id: '', name: '', phone: '', notes: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setClients(await listClients(session.session_token, search))
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [search])

  function openNew() {
    setForm({ id: '', name: '', phone: '', notes: '' })
    setModalOpen(true)
  }

  function openEdit(client) {
    setForm({ id: client.id, name: client.name, phone: client.phone || '', notes: client.notes || '' })
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await saveClient(session.session_token, form)
      showToast('Cliente salvo com sucesso.')
      setModalOpen(false)
      await load()
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
          <span className="eyebrow">Relacionamento</span>
          <h2>Clientes</h2>
          <p>Cadastre clientes e acompanhe histórico de atendimentos.</p>
        </div>
        <button className="btn primary" onClick={openNew} type="button"><Plus size={17} /> Novo cliente</button>
      </div>

      <div className="search-card">
        <Search size={18} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone" />
      </div>

      {loading && <div className="loading-card">Carregando clientes...</div>}
      <div className="list-grid">
        {clients.map((client) => (
          <button type="button" className="data-card" key={client.id} onClick={() => openEdit(client)}>
            <div>
              <h3>{client.name}</h3>
              <p>{client.phone || 'Sem telefone'}</p>
            </div>
            <div className="data-meta">
              <span>{client.total_appointments || 0} atendimento(s)</span>
              <small>Último: {client.last_appointment ? formatDateBR(client.last_appointment) : '-'}</small>
            </div>
            {client.notes && <p className="data-notes">{client.notes}</p>}
          </button>
        ))}
      </div>
      {!loading && clients.length === 0 && <div className="empty-state big">Nenhum cliente encontrado.</div>}

      <Modal open={modalOpen} title={form.id ? 'Editar cliente' : 'Novo cliente'} onClose={() => setModalOpen(false)} footer={<><button className="btn soft" type="button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="btn primary" type="submit" form="client-form" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button></>}>
        <form id="client-form" onSubmit={handleSave} className="form-stack">
          <label><span>Nome</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label><span>WhatsApp</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })} placeholder="(00) 00000-0000" /></label>
          <label><span>Observações</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows="4" /></label>
        </form>
      </Modal>
    </section>
  )
}
