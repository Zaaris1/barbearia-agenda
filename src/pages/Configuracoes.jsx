import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, ImageIcon, Palette, QrCode, Save, Send, Settings, ShieldCheck, Sparkles } from 'lucide-react'
import { updateBarbershopBranding, updateBarbershopSettings } from '../lib/api'
import { buildThemeStyle, instagramUrl, normalizeUrl, presetOptions, publicBookingLink, qrCodeUrl, THEME_PRESETS } from '../lib/branding'

function normalizeSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function setPresetColors(presetId, setForm) {
  const preset = THEME_PRESETS[presetId] || THEME_PRESETS.classic_gold
  setForm((old) => ({
    ...old,
    presetTheme: preset.id,
    primaryColor: preset.primary_color,
    secondaryColor: preset.secondary_color,
    accentColor: preset.accent_color,
    bgColor: preset.bg_color,
    surfaceColor: preset.surface_color,
    textColor: preset.text_color,
  }))
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
    logoUrl: '',
    coverUrl: '',
    faviconUrl: '',
    slogan: '',
    instagram: '',
    openingHoursText: '',
    presetTheme: 'classic_gold',
    primaryColor: '#D4A857',
    secondaryColor: '#0B0B0C',
    accentColor: '#F5C66A',
    bgColor: '#09090B',
    surfaceColor: '#151518',
    textColor: '#F5F5F5',
  })

  useEffect(() => {
    setForm({
      name: shop?.name || '',
      slug: shop?.slug || '',
      phone: shop?.phone || '',
      address: shop?.address || '',
      defaultSlotMinutes: Number(shop?.default_slot_minutes || 30),
      publicBookingEnabled: shop?.public_booking_enabled !== false,
      logoUrl: shop?.logo_url || '',
      coverUrl: shop?.cover_url || '',
      faviconUrl: shop?.favicon_url || '',
      slogan: shop?.slogan || '',
      instagram: shop?.instagram || '',
      openingHoursText: shop?.opening_hours_text || '',
      presetTheme: shop?.preset_theme || 'classic_gold',
      primaryColor: shop?.primary_color || '#D4A857',
      secondaryColor: shop?.secondary_color || '#0B0B0C',
      accentColor: shop?.accent_color || '#F5C66A',
      bgColor: shop?.bg_color || '#09090B',
      surfaceColor: shop?.surface_color || '#151518',
      textColor: shop?.text_color || '#F5F5F5',
    })
  }, [
    shop?.id,
    shop?.name,
    shop?.slug,
    shop?.phone,
    shop?.address,
    shop?.default_slot_minutes,
    shop?.public_booking_enabled,
    shop?.logo_url,
    shop?.cover_url,
    shop?.favicon_url,
    shop?.slogan,
    shop?.instagram,
    shop?.opening_hours_text,
    shop?.preset_theme,
    shop?.primary_color,
    shop?.secondary_color,
    shop?.accent_color,
    shop?.bg_color,
    shop?.surface_color,
    shop?.text_color,
  ])

  const publicLink = useMemo(() => publicBookingLink(form.slug || shop?.slug), [form.slug, shop?.slug])
  const panelLink = useMemo(() => `${window.location.origin}/app/${form.slug || shop?.slug || 'barbearia-demo'}`, [form.slug, shop?.slug])
  const themeStyle = useMemo(() => buildThemeStyle({
    preset_theme: form.presetTheme,
    primary_color: form.primaryColor,
    secondary_color: form.secondaryColor,
    accent_color: form.accentColor,
    bg_color: form.bgColor,
    surface_color: form.surfaceColor,
    text_color: form.textColor,
  }), [form.presetTheme, form.primaryColor, form.secondaryColor, form.accentColor, form.bgColor, form.surfaceColor, form.textColor])

  function setField(field, value) {
    setForm((old) => ({ ...old, [field]: value }))
  }

  async function copyText(text, label = 'Texto copiado.') {
    try {
      await navigator.clipboard.writeText(text)
      showToast(label)
    } catch {
      showToast('Não foi possível copiar automaticamente. Copie manualmente.', 'error')
    }
  }

  async function sharePublicLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: form.name || 'Agendamento', text: `Agende seu horário em ${form.name || 'nossa barbearia'}`, url: publicLink })
        return
      } catch {}
    }
    copyText(publicLink, 'Link público copiado para compartilhar.')
  }

  async function save(e) {
    e.preventDefault()
    if (!isAdmin) return showToast('Somente administrador pode alterar configurações.', 'error')

    const cleanSlug = normalizeSlug(form.slug)
    if (!form.name.trim()) return showToast('Informe o nome da barbearia.', 'error')
    if (!cleanSlug) return showToast('Informe um identificador válido para o link público.', 'error')

    setSaving(true)
    try {
      await updateBarbershopSettings(session.session_token, { ...form, slug: cleanSlug })
      await updateBarbershopBranding(session.session_token, form)
      showToast('Identidade e configurações salvas com sucesso.')
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
    <section className="page-content branded-config" style={themeStyle}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Administração</span>
          <h2>Configurações e identidade visual</h2>
          <p>Personalize a barbearia, o link público, cores, logo, capa, QR Code e dados comerciais.</p>
        </div>
        <div className="heading-actions">
          <a className="btn soft" href={publicLink} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Abrir público</a>
          <button className="btn primary" type="submit" form="settings-form" disabled={saving}><Save size={17} /> {saving ? 'Salvando...' : 'Salvar tudo'}</button>
        </div>
      </div>

      <div className="settings-grid wide-settings-grid">
        <form id="settings-form" className="panel-card settings-card" onSubmit={save}>
          <div className="panel-title">
            <h3>Dados principais</h3>
            <span>Nome, contato, link e funcionamento</span>
          </div>

          <div className="form-grid">
            <label className="full">
              <span>Nome da barbearia</span>
              <input value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Ex: Barbearia do João" required />
            </label>

            <label>
              <span>Identificador do link público</span>
              <input value={form.slug} onChange={(e) => setField('slug', normalizeSlug(e.target.value))} placeholder="barbearia-do-joao" required />
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
              <span>Instagram</span>
              <input value={form.instagram} onChange={(e) => setField('instagram', e.target.value)} placeholder="@barbearia" />
            </label>

            <label>
              <span>Horário de funcionamento</span>
              <input value={form.openingHoursText} onChange={(e) => setField('openingHoursText', e.target.value)} placeholder="Seg a Sáb • 08h às 19h" />
            </label>

            <label className="full">
              <span>Slogan / frase de chamada</span>
              <input value={form.slogan} onChange={(e) => setField('slogan', e.target.value)} placeholder="Ex: Estilo, precisão e atendimento premium." />
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

          <div className="section-divider" />

          <div className="panel-title">
            <h3>Logo, capa e favicon</h3>
            <span>Use links diretos de imagem por enquanto</span>
          </div>

          <div className="form-grid">
            <label className="full">
              <span>URL da logo</span>
              <input value={form.logoUrl} onChange={(e) => setField('logoUrl', e.target.value)} placeholder="https://.../logo.png" />
            </label>
            <label className="full">
              <span>URL da capa/banner</span>
              <input value={form.coverUrl} onChange={(e) => setField('coverUrl', e.target.value)} placeholder="https://.../capa.jpg" />
            </label>
            <label className="full">
              <span>URL do favicon</span>
              <input value={form.faviconUrl} onChange={(e) => setField('faviconUrl', e.target.value)} placeholder="https://.../favicon.png" />
            </label>
          </div>

          <div className="section-divider" />

          <div className="panel-title">
            <h3>Preset e cores</h3>
            <span>Escolha um tema pronto ou ajuste manualmente</span>
          </div>

          <div className="preset-grid">
            {presetOptions().map((preset) => (
              <button
                type="button"
                key={preset.id}
                className={`preset-card ${form.presetTheme === preset.id ? 'active' : ''}`}
                onClick={() => setPresetColors(preset.id, setForm)}
              >
                <span className="preset-dots">
                  <i style={{ background: preset.primary_color }} />
                  <i style={{ background: preset.secondary_color }} />
                  <i style={{ background: preset.accent_color }} />
                </span>
                <strong>{preset.name}</strong>
                <small>{preset.description}</small>
              </button>
            ))}
          </div>

          <div className="color-grid">
            <label><span>Primária</span><input type="color" value={form.primaryColor} onChange={(e) => setField('primaryColor', e.target.value)} /></label>
            <label><span>Secundária</span><input type="color" value={form.secondaryColor} onChange={(e) => setField('secondaryColor', e.target.value)} /></label>
            <label><span>Destaque</span><input type="color" value={form.accentColor} onChange={(e) => setField('accentColor', e.target.value)} /></label>
            <label><span>Fundo</span><input type="color" value={form.bgColor} onChange={(e) => setField('bgColor', e.target.value)} /></label>
            <label><span>Card</span><input type="color" value={form.surfaceColor} onChange={(e) => setField('surfaceColor', e.target.value)} /></label>
            <label><span>Texto</span><input type="color" value={form.textColor} onChange={(e) => setField('textColor', e.target.value)} /></label>
          </div>
        </form>

        <div className="settings-side-stack">
          <div className="panel-card brand-preview-card" style={themeStyle}>
            <div className="preview-cover" style={{ backgroundImage: normalizeUrl(form.coverUrl) ? `linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.82)), url(${normalizeUrl(form.coverUrl)})` : undefined }}>
              <div className="preview-logo">
                {normalizeUrl(form.logoUrl) ? <img src={normalizeUrl(form.logoUrl)} alt="Logo" /> : <ImageIcon size={28} />}
              </div>
              <span className="eyebrow">Prévia pública</span>
              <h3>{form.name || 'Nome da barbearia'}</h3>
              <p>{form.slogan || 'Slogan ou frase comercial da barbearia.'}</p>
            </div>
            <div className="preview-actions">
              <span className="preview-chip"><Sparkles size={14} /> {THEME_PRESETS[form.presetTheme]?.name || 'Tema'}</span>
              <span className="preview-chip"><Palette size={14} /> Cores próprias</span>
            </div>
          </div>

          <div className="panel-card settings-side-card">
            <div className="settings-icon"><QrCode size={24} /></div>
            <h3>QR Code e link público</h3>
            <p>Use este QR Code em balcão, espelho, recepção, cartão e Instagram.</p>
            <div className="qr-box"><img src={qrCodeUrl(publicLink)} alt="QR Code do agendamento público" /></div>
            <div className="public-link-box">
              <span>{publicLink}</span>
              <button className="ghost-icon" type="button" onClick={() => copyText(publicLink, 'Link público copiado.')} title="Copiar link"><Copy size={17} /></button>
            </div>
            <div className="side-actions-grid">
              <a className="btn soft" href={publicLink} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Abrir</a>
              <button className="btn soft" type="button" onClick={sharePublicLink}><Send size={16} /> Compartilhar</button>
            </div>
            <div className="public-link-box compact">
              <span>{panelLink}</span>
              <button className="ghost-icon" type="button" onClick={() => copyText(panelLink, 'Link do painel copiado.')} title="Copiar painel"><Copy size={17} /></button>
            </div>
            <div className="security-note">
              <ShieldCheck size={18} />
              <span>Clientes não acessam dashboard, financeiro, lista de clientes ou dados internos.</span>
            </div>
          </div>

          {form.instagram && (
            <div className="panel-card notice-card">
              <strong>Instagram detectado</strong>
              <a href={instagramUrl(form.instagram)} target="_blank" rel="noreferrer">Abrir perfil configurado</a>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
