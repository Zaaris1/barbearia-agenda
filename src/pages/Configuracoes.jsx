import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, Save, Settings, ShieldCheck } from 'lucide-react'
import { updateBarbershopSettings } from '../lib/api'

function normalizeSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function Configuracoes({ session, bootstrap, showToast, refreshBootstrap }) {
  const shop = bootstrap?.barbershop || session?.barbershop || {}
  const isAdmin = session?.user?.role === 'ADMIN'
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    slug: '',
    phone: '',
    address: '',
    defaultSlotMinutes: 30,
    publicBookingEnabled: true,
  })

  useEffect(() => {
    setForm({
      name: shop?.name || '',
      slug: shop?.slug || '',
      phone: shop?.phone || '',
      address: shop?.address || '',
      defaultSlotMinutes: Number(shop?.default_slot_minutes || 30),
      publicBookingEnabled: shop?.public_booking_enabled !== false,
    })
  }, [shop?.id, shop?.name, shop?.slug, shop?.phone, shop?.address, shop?.default_slot_minutes, shop?.public_booking_enabled])

  const publicLink = useMemo(() => {
    const slug = form.slug || shop?.slug || import.meta.env.VITE_DEFAULT_SHOP_SLUG || 'barbearia-demo'
    return `${window.location.origin}/agendar/${slug}`
  }, [form.slug, shop?.slug])

  function setField(field, value) {
    setForm((old) => ({ ...old, [field]: value }))
  }

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(publicLink)
      showToast('Link público copiado.')
    } catch {
      showToast('Não foi possível copiar automaticamente. Copie o link manualmente.', 'error')
    }
  }

  async function save(e) {
    e.preventDefault()
    if (!isAdmin) {
      showToast('Somente administrador pode alterar configurações.', 'error')
      return
    }

    const cleanSlug = normalizeSlug(form.slug)
    if (!form.name.trim()) {
      showToast('Informe o nome da barbearia.', 'error')
      return
    }
    if (!cleanSlug) {
      showToast('Informe um identificador válido para o link público.', 'error')
      return
    }

    setSaving(true)
    try {
      await updateBarbershopSettings(session.session_token, {
        ...form,
        slug: cleanSlug,
      })
      showToast('Configurações salvas com sucesso.')
      await refreshBootstrap?.()
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <section className="page-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Administração</span>
            <h2>Configurações</h2>
            <p>Somente o administrador pode alterar os dados principais da barbearia.</p>
          </div>
        </div>
        <div className="empty-state big">Acesse com PIN de administrador para visualizar esta área.</div>
      </section>
    )
  }

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Administração</span>
          <h2>Configurações</h2>
          <p>Personalize a barbearia, o link público e a base de horários do sistema.</p>
        </div>
        <div className="heading-actions">
          <a className="btn soft" href={publicLink} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Abrir link público</a>
          <button className="btn primary" type="submit" form="settings-form" disabled={saving}><Save size={17} /> {saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>

      <div className="settings-grid">
        <form id="settings-form" className="panel-card settings-card" onSubmit={save}>
          <div className="panel-title">
            <h3>Dados da barbearia</h3>
            <span>Identidade principal</span>
          </div>

          <div className="form-grid">
            <label className="full">
              <span>Nome da barbearia</span>
              <input value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Ex: Barbearia do João" required />
            </label>

            <label>
              <span>Identificador do link público</span>
              <input
                value={form.slug}
                onChange={(e) => setField('slug', normalizeSlug(e.target.value))}
                placeholder="barbearia-do-joao"
                required
              />
            </label>

            <label>
              <span>WhatsApp da barbearia</span>
              <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="(00) 00000-0000" />
            </label>

            <label className="full">
              <span>Endereço</span>
              <input value={form.address} onChange={(e) => setField('address', e.target.value)} placeholder="Rua, número, bairro e cidade" />
            </label>

            <label>
              <span>Intervalo padrão da agenda</span>
              <select value={form.defaultSlotMinutes} onChange={(e) => setField('defaultSlotMinutes', Number(e.target.value))}>
                <option value={15}>15 minutos</option>
                <option value={20}>20 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>60 minutos</option>
              </select>
            </label>

            <label className="check-row settings-check">
              <input type="checkbox" checked={form.publicBookingEnabled} onChange={(e) => setField('publicBookingEnabled', e.target.checked)} />
              <span>Permitir agendamento público</span>
            </label>
          </div>
        </form>

        <div className="panel-card settings-side-card">
          <div className="settings-icon"><Settings size={24} /></div>
          <h3>Link público de agendamento</h3>
          <p>Envie este link para o cliente escolher serviço, barbeiro, data e horário disponível.</p>

          <div className="public-link-box">
            <span>{publicLink}</span>
            <button className="ghost-icon" type="button" onClick={copyPublicLink} title="Copiar link"><Copy size={17} /></button>
          </div>

          <div className="security-note">
            <ShieldCheck size={18} />
            <span>Clientes não acessam dashboard, financeiro, lista de clientes ou dados internos.</span>
          </div>

          <div className="notice">
            <strong>Próximos cadastros</strong>
            <span>Use as abas Serviços e Barbeiros para ajustar valores, duração, equipe e PINs.</span>
          </div>
        </div>
      </div>
    </section>
  )
}
