import { useEffect, useMemo, useState } from 'react'
import { Copy, CreditCard, ExternalLink, ImageIcon, KeyRound, Palette, QrCode, RefreshCw, Save, Send, Settings, ShieldCheck, Sparkles, UploadCloud, UserPlus, Users } from 'lucide-react'
import { changeOwnPin, listAccessUsers, saveAccessUser, updateBarbershopBranding, updateBarbershopMessages, updateBarbershopPayment, updateBarbershopSettings } from '../lib/api'
import { buildThemeStyle, instagramUrl, normalizeUrl, presetOptions, publicBookingLink, qrCodeUrl, THEME_PRESETS } from '../lib/branding'
import { buildPixPayload, getPaymentModeLabel, pixQrCodeUrl } from '../lib/pix'
import { formatMoney } from '../lib/dates'
import { uploadBrandingImage } from '../lib/uploads'
import { formatPhoneInput, normalizeSlug } from '../lib/formatters'

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

const SETTINGS_TABS = [
  { id: 'dados', label: 'Dados', icon: Settings },
  { id: 'midia', label: 'Imagens', icon: ImageIcon },
  { id: 'pix', label: 'Pix', icon: CreditCard },
  { id: 'mensagens', label: 'Mensagens', icon: Send },
  { id: 'cores', label: 'Cores', icon: Palette },
  { id: 'acessos', label: 'Acessos', icon: Users },
]

const emptyAccessForm = {
  id: '',
  name: '',
  phone: '',
  role: 'BARBER',
  isProfessional: true,
  active: true,
  pin: '',
}

export default function Configuracoes({ session, bootstrap, showToast, refreshBootstrap, pageParams }) {
  const shop = bootstrap?.barbershop || session?.barbershop || {}
  const isAdmin = session?.user?.role === 'ADMIN'
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState('')
  const [activeTab, setActiveTab] = useState('dados')
  const [accessUsers, setAccessUsers] = useState([])
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessSaving, setAccessSaving] = useState(false)
  const [accessForm, setAccessForm] = useState(emptyAccessForm)
  const [pinSaving, setPinSaving] = useState(false)
  const [pinForm, setPinForm] = useState({ currentPin: '', newPin: '', confirmPin: '' })
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
    paymentEnabled: false,
    paymentMode: 'DISABLED',
    pixKey: '',
    pixKeyType: 'EVP',
    pixReceiverName: '',
    pixReceiverCity: '',
    depositType: 'PERCENT',
    depositValue: 50,
    paymentInstructions: '',
    confirmationTemplate: '',
    reminderTemplate: '',
    cancellationTemplate: '',
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
      paymentEnabled: shop?.payment_enabled === true,
      paymentMode: shop?.payment_mode || 'DISABLED',
      pixKey: shop?.pix_key || '',
      pixKeyType: shop?.pix_key_type || 'EVP',
      pixReceiverName: shop?.pix_receiver_name || shop?.name || '',
      pixReceiverCity: shop?.pix_receiver_city || '',
      depositType: shop?.deposit_type || 'PERCENT',
      depositValue: Number(shop?.deposit_value ?? 50),
      paymentInstructions: shop?.payment_instructions || '',
      confirmationTemplate: shop?.whatsapp_confirmation_template || '',
      reminderTemplate: shop?.whatsapp_reminder_template || '',
      cancellationTemplate: shop?.whatsapp_cancellation_template || '',
    })
  }, [shop?.id, shop?.updated_at, bootstrap])

  useEffect(() => {
    if (activeTab === 'acessos' && isAdmin) {
      loadAccessUsers()
    }
  }, [activeTab, isAdmin, session?.session_token])

  useEffect(() => {
    if (pageParams?.source !== 'activation') return
    if (SETTINGS_TABS.some((tab) => tab.id === pageParams?.tab)) {
      setActiveTab(pageParams.tab)
    }
  }, [pageParams?.source, pageParams?.tab])

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

  const pixPreviewAmount = form.paymentMode === 'DEPOSIT'
    ? (form.depositType === 'FIXED' ? Number(form.depositValue || 0) : 50)
    : 50

  const pixPreviewPayload = useMemo(() => buildPixPayload({
    pixKey: form.pixKey,
    pixKeyType: form.pixKeyType,
    receiverName: form.pixReceiverName || form.name,
    receiverCity: form.pixReceiverCity || 'BRASIL',
    amount: pixPreviewAmount,
    txid: 'TESTE',
    description: 'AGENDAMENTO',
  }), [form.pixKey, form.pixKeyType, form.pixReceiverName, form.pixReceiverCity, form.name, pixPreviewAmount])

  const showBrandPreview = activeTab === 'midia' || activeTab === 'cores'
  const showPixPreview = activeTab === 'pix'
  const showLinkCard = activeTab === 'dados' || activeTab === 'mensagens'
  const showInstagramCard = activeTab === 'dados' && form.instagram
  const accessFormIsSelf = accessForm.id && accessForm.id === session?.user?.id
  const guidedFocus = pageParams?.source === 'activation'

  function setField(field, value) {
    setForm((old) => {
      const next = { ...old, [field]: value }
      if (field === 'paymentEnabled' && value === false) next.paymentMode = 'DISABLED'
      if (field === 'paymentEnabled' && value === true && next.paymentMode === 'DISABLED') next.paymentMode = 'OPTIONAL'
      return next
    })
  }

  function pinLooksValid(value) {
    return /^[0-9]{4,12}$/.test(String(value || '').trim())
  }

  function roleLabel(role) {
    const labels = { ADMIN: 'Gestor', BARBER: 'Profissional', ATTENDANT: 'Atendente' }
    return labels[role] || 'Profissional'
  }

  function accessProfessionalChecked(data = accessForm) {
    return data.role === 'BARBER' || data.isProfessional === true
  }

  function resetAccessForm() {
    setAccessForm(emptyAccessForm)
  }

  function setAccessRole(role) {
    setAccessForm((old) => ({
      ...old,
      role,
      isProfessional: role === 'BARBER' ? true : Boolean(old.id) && old.isProfessional,
    }))
  }

  function editAccessUser(user) {
    setAccessForm({
      id: user.id,
      name: user.name || '',
      phone: user.phone || '',
      role: user.role || 'BARBER',
      isProfessional: user.role === 'BARBER' || user.is_professional === true,
      active: user.active !== false,
      pin: '',
    })
  }

  async function loadAccessUsers() {
    if (!session?.session_token) return
    setAccessLoading(true)
    try {
      setAccessUsers(await listAccessUsers(session.session_token))
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setAccessLoading(false)
    }
  }

  async function handleAccessSave() {
    if (!accessForm.name.trim()) return showToast('Informe o nome do usuário.', 'error')
    if (!accessForm.id && !pinLooksValid(accessForm.pin)) return showToast('Informe um PIN inicial com 4 a 12 números.', 'error')
    if (accessForm.id && accessForm.pin && !pinLooksValid(accessForm.pin)) return showToast('O novo PIN deve ter de 4 a 12 números.', 'error')

    setAccessSaving(true)
    try {
      await saveAccessUser(session.session_token, accessForm)
      showToast(accessForm.id ? 'Acesso atualizado com sucesso.' : 'Acesso criado com sucesso.')
      resetAccessForm()
      await loadAccessUsers()
      await refreshBootstrap?.()
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setAccessSaving(false)
    }
  }

  async function handleOwnPinChange() {
    if (!pinForm.currentPin.trim()) return showToast('Informe seu PIN atual.', 'error')
    if (!pinLooksValid(pinForm.newPin)) return showToast('O novo PIN deve ter de 4 a 12 números.', 'error')
    if (pinForm.newPin !== pinForm.confirmPin) return showToast('A confirmação do PIN não confere.', 'error')

    setPinSaving(true)
    try {
      await changeOwnPin(session.session_token, pinForm.currentPin.trim(), pinForm.newPin.trim())
      setPinForm({ currentPin: '', newPin: '', confirmPin: '' })
      showToast('Seu PIN foi alterado com sucesso.')
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setPinSaving(false)
    }
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

  async function handleBrandUpload(field, kind, file) {
    if (!file) return

    setUploading(field)

    try {
      const url = await uploadBrandingImage(session.session_token, kind, file)
      setField(field, url)
      showToast('Imagem enviada. Clique em Salvar tudo para gravar na barbearia.')
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setUploading('')
    }
  }

  async function save(e) {
    e.preventDefault()
    if (activeTab === 'acessos') return
    if (!isAdmin) return showToast('Somente gestor pode alterar configurações.', 'error')

    const cleanSlug = normalizeSlug(form.slug)
    if (!form.name.trim()) return showToast('Informe o nome da barbearia.', 'error')
    if (!cleanSlug) return showToast('Informe um identificador válido para o link público.', 'error')
    if (form.paymentEnabled && form.paymentMode !== 'DISABLED' && !form.pixKey.trim()) return showToast('Informe a chave Pix ou desative o pagamento.', 'error')
    if (form.paymentEnabled && form.paymentMode !== 'DISABLED' && !form.pixReceiverName.trim()) return showToast('Informe o nome do recebedor do Pix.', 'error')
    if (form.paymentEnabled && form.paymentMode !== 'DISABLED' && !form.pixReceiverCity.trim()) return showToast('Informe a cidade do recebedor do Pix.', 'error')

    setSaving(true)
    try {
      await updateBarbershopSettings(session.session_token, { ...form, slug: cleanSlug })
      await updateBarbershopBranding(session.session_token, form)
      await updateBarbershopPayment(session.session_token, form)
      await updateBarbershopMessages(session.session_token, form)
      showToast('Configurações, identidade, Pix e mensagens salvos com sucesso.')
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
            <span className="eyebrow">Gestão</span>
            <h2>Configurações</h2>
            <p>Somente o gestor pode alterar os dados principais da barbearia.</p>
          </div>
        </div>
        <div className="empty-state big">Acesse com PIN de gestor para visualizar esta área.</div>
      </section>
    )
  }

  return (
    <section className="page-content branded-config" style={themeStyle}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Gestão</span>
          <h2>Configurações e identidade visual</h2>
          <p>Personalize a barbearia, link público, cores, logo, capa, QR Code e Pix manual.</p>
        </div>
        <div className="heading-actions">
          <a className="btn soft" href={publicLink} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Abrir público</a>
          {activeTab !== 'acessos' && <button className="btn primary" type="submit" form="settings-form" disabled={saving}><Save size={17} /> {saving ? 'Salvando...' : 'Salvar tudo'}</button>}
        </div>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Secoes de configuracoes">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon
          const tabClass = [activeTab === tab.id ? 'active' : '', guidedFocus && pageParams?.tab === tab.id ? 'guided' : ''].filter(Boolean).join(' ')
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={tabClass}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className="settings-grid wide-settings-grid">
        <form id="settings-form" className={`panel-card settings-card ${guidedFocus ? 'guided-focus-card' : ''}`} onSubmit={save}>
          {guidedFocus && (
            <div className="guided-focus-note">
              <Sparkles size={17} />
              <span>Etapa do checklist: <strong>{pageParams?.title || 'configuração pendente'}</strong>. Ajuste os campos desta aba e salve.</span>
            </div>
          )}
          {activeTab === 'dados' && (
            <div className="settings-tab-panel">
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
              <input value={form.phone} onChange={(e) => setField('phone', formatPhoneInput(e.target.value))} placeholder="(00) 00000-0000" />
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

            </div>
          )}

          {activeTab === 'midia' && (
            <div className="settings-tab-panel">
          <div className="panel-title">
            <h3>Logo, capa e favicon</h3>
            <span>Envie imagens pelo painel ou cole uma URL pronta</span>
          </div>

          <div className="form-grid branding-upload-grid">
            <label className="full">
              <span>URL da logo</span>
              <input value={form.logoUrl} onChange={(e) => setField('logoUrl', e.target.value)} placeholder="https://.../logo.png" />
            </label>
            <div className="upload-card full">
              <div>
                <strong><ImageIcon size={17} /> Enviar logo</strong>
                <small>PNG transparente, JPG, WEBP ou SVG. Ideal: quadrada.</small>
              </div>
              <label className="btn soft upload-btn">
                <UploadCloud size={16} /> {uploading === 'logoUrl' ? 'Enviando...' : 'Selecionar'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon" onChange={(e) => handleBrandUpload('logoUrl', 'logo', e.target.files?.[0])} disabled={uploading === 'logoUrl'} />
              </label>
            </div>

            <label className="full">
              <span>URL da capa/banner</span>
              <input value={form.coverUrl} onChange={(e) => setField('coverUrl', e.target.value)} placeholder="https://.../capa.jpg" />
            </label>
            <div className="upload-card full">
              <div>
                <strong><ImageIcon size={17} /> Enviar capa/banner</strong>
                <small>Imagem horizontal. Ideal: 1600x600 ou 1920x700.</small>
              </div>
              <label className="btn soft upload-btn">
                <UploadCloud size={16} /> {uploading === 'coverUrl' ? 'Enviando...' : 'Selecionar'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleBrandUpload('coverUrl', 'capa', e.target.files?.[0])} disabled={uploading === 'coverUrl'} />
              </label>
            </div>

            <label className="full">
              <span>URL do favicon</span>
              <input value={form.faviconUrl} onChange={(e) => setField('faviconUrl', e.target.value)} placeholder="https://.../favicon.png" />
            </label>
            <div className="upload-card full">
              <div>
                <strong><ImageIcon size={17} /> Enviar favicon</strong>
                <small>Ícone quadrado. Ideal: 512x512 em PNG.</small>
              </div>
              <label className="btn soft upload-btn">
                <UploadCloud size={16} /> {uploading === 'faviconUrl' ? 'Enviando...' : 'Selecionar'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" onChange={(e) => handleBrandUpload('faviconUrl', 'favicon', e.target.files?.[0])} disabled={uploading === 'faviconUrl'} />
              </label>
            </div>
          </div>

            </div>
          )}

          {activeTab === 'pix' && (
            <div className="settings-tab-panel">
          <div className="panel-title">
            <h3>Pagamento Pix manual</h3>
            <span>Configure chave Pix, QR Code e regra de cobrança na página pública</span>
          </div>

          <div className="form-grid payment-form-grid">
            <label className="check-row settings-check full">
              <input type="checkbox" checked={form.paymentEnabled} onChange={(e) => setField('paymentEnabled', e.target.checked)} />
              <span>Ativar Pix na página pública de agendamento</span>
            </label>

            <label>
              <span>Regra de pagamento</span>
              <select value={form.paymentMode} onChange={(e) => setField('paymentMode', e.target.value)} disabled={!form.paymentEnabled}>
                <option value="DISABLED">Desativado</option>
                <option value="OPTIONAL">Pix opcional</option>
                <option value="REQUIRED">Pix obrigatório / valor total</option>
                <option value="DEPOSIT">Sinal para reservar</option>
              </select>
            </label>

            <label>
              <span>Tipo da chave Pix</span>
              <select value={form.pixKeyType} onChange={(e) => setField('pixKeyType', e.target.value)} disabled={!form.paymentEnabled}>
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
                <option value="PHONE">Telefone</option>
                <option value="EMAIL">E-mail</option>
                <option value="EVP">Aleatória</option>
              </select>
            </label>

            <label className="full">
              <span>Chave Pix</span>
              <input value={form.pixKey} onChange={(e) => setField('pixKey', e.target.value)} placeholder="CPF, CNPJ, telefone, e-mail ou chave aleatória" disabled={!form.paymentEnabled} />
            </label>

            <label>
              <span>Nome do recebedor</span>
              <input value={form.pixReceiverName} onChange={(e) => setField('pixReceiverName', e.target.value)} placeholder="Nome que aparecerá no Pix" disabled={!form.paymentEnabled} />
            </label>

            <label>
              <span>Cidade do recebedor</span>
              <input value={form.pixReceiverCity} onChange={(e) => setField('pixReceiverCity', e.target.value)} placeholder="Ex: Nova Iguaçu" disabled={!form.paymentEnabled} />
            </label>

            {form.paymentMode === 'DEPOSIT' && (
              <>
                <label>
                  <span>Tipo de sinal</span>
                  <select value={form.depositType} onChange={(e) => setField('depositType', e.target.value)} disabled={!form.paymentEnabled}>
                    <option value="PERCENT">Percentual</option>
                    <option value="FIXED">Valor fixo</option>
                  </select>
                </label>
                <label>
                  <span>{form.depositType === 'FIXED' ? 'Valor do sinal' : 'Percentual do sinal'}</span>
                  <input type="number" min="0" step="0.01" value={form.depositValue} onChange={(e) => setField('depositValue', e.target.value)} disabled={!form.paymentEnabled} />
                </label>
              </>
            )}

            <label className="full">
              <span>Instruções para o cliente</span>
              <textarea value={form.paymentInstructions} onChange={(e) => setField('paymentInstructions', e.target.value)} rows="3" placeholder="Ex: Para confirmar seu horário, envie o comprovante pelo WhatsApp." disabled={!form.paymentEnabled} />
            </label>
          </div>

            </div>
          )}

          {activeTab === 'mensagens' && (
            <div className="settings-tab-panel">
          <div className="panel-title">
            <h3>Mensagens WhatsApp</h3>
            <span>Personalize os textos enviados para confirmação, lembrete e cancelamento</span>
          </div>

          <div className="message-template-help full">
            <strong>Variáveis disponíveis:</strong>
            <span>{'{cliente}'}</span>
            <span>{'{barbearia}'}</span>
            <span>{'{servico}'}</span>
            <span>{'{profissional}'}</span>
            <span>{'{data}'}</span>
            <span>{'{hora}'}</span>
            <span>{'{valor}'}</span>
            <span>{'{endereco}'}</span>
          </div>

          <div className="form-grid message-template-grid">
            <label className="full">
              <span>Mensagem de confirmação</span>
              <textarea
                value={form.confirmationTemplate}
                onChange={(e) => setField('confirmationTemplate', e.target.value)}
                rows="5"
                placeholder={'Olá, {cliente}!\n\nSeu agendamento foi confirmado na {barbearia}.\nServiço: {servico}\nProfissional: {profissional}\nData: {data} às {hora}.\nEndereço: {endereco}'}
              />
            </label>

            <label className="full">
              <span>Mensagem de lembrete</span>
              <textarea
                value={form.reminderTemplate}
                onChange={(e) => setField('reminderTemplate', e.target.value)}
                rows="5"
                placeholder={'Olá, {cliente}!\n\nLembrete do seu horário na {barbearia}:\n{servico} com {profissional}, dia {data} às {hora}.\nTe esperamos!'}
              />
            </label>

            <label className="full">
              <span>Mensagem de cancelamento</span>
              <textarea
                value={form.cancellationTemplate}
                onChange={(e) => setField('cancellationTemplate', e.target.value)}
                rows="5"
                placeholder={'Olá, {cliente}.\n\nSeu agendamento na {barbearia} foi cancelado.\nServiço: {servico}\nData: {data} às {hora}.\nPara remarcar, fale conosco.'}
              />
            </label>
          </div>

            </div>
          )}

          {activeTab === 'cores' && (
            <div className="settings-tab-panel">
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
            </div>
          )}

          {activeTab === 'acessos' && (
            <div className="settings-tab-panel access-tab-panel">
              <div className="panel-title with-actions">
                <div>
                  <h3>Acessos e PINs</h3>
                  <span>{accessLoading ? 'Atualizando...' : `${accessUsers.length} usuário(s) cadastrados`}</span>
                </div>
                <button className="btn soft" type="button" onClick={loadAccessUsers} disabled={accessLoading}>
                  <RefreshCw size={16} /> Atualizar
                </button>
              </div>

              <div className="access-management-grid">
                <div className="access-user-list">
                  {accessUsers.length === 0 && !accessLoading && <div className="empty-state">Nenhum usuário cadastrado.</div>}
                  {accessUsers.map((user) => (
                    <button
                      type="button"
                      className={`access-user-card ${!user.active ? 'inactive' : ''} ${accessForm.id === user.id ? 'active' : ''}`}
                      key={user.id}
                      onClick={() => editAccessUser(user)}
                    >
                      <span className="access-user-avatar">{user.name?.slice(0, 1) || 'U'}</span>
                      <span>
                        <strong>{user.name}</strong>
                        <small>{user.phone || 'Sem telefone'}{user.is_professional ? ' • atende na agenda' : ''}</small>
                      </span>
                      <em className={`mini-status ${user.active ? 'ok' : 'danger'}`}>{user.active ? roleLabel(user.role) : 'Inativo'}</em>
                    </button>
                  ))}
                </div>

                <div className="access-editor-stack">
                  <div className="access-editor-card">
                    <div className="panel-subtitle">{accessForm.id ? 'Editar usuário' : 'Novo usuário'}</div>
                    <div className="form-grid">
                      <label>
                        <span>Nome</span>
                        <input value={accessForm.name} onChange={(e) => setAccessForm({ ...accessForm, name: e.target.value })} placeholder="Nome do usuário" />
                      </label>
                      <label>
                        <span>WhatsApp</span>
                        <input value={accessForm.phone} onChange={(e) => setAccessForm({ ...accessForm, phone: formatPhoneInput(e.target.value) })} placeholder="(00) 00000-0000" />
                      </label>
                      <label>
                        <span>Perfil</span>
                        <select value={accessForm.role} onChange={(e) => setAccessRole(e.target.value)} disabled={Boolean(accessFormIsSelf)}>
                          <option value="BARBER">Profissional</option>
                          <option value="ATTENDANT">Atendente</option>
                          <option value="ADMIN">Gestor</option>
                        </select>
                      </label>
                      <label>
                        <span>{accessForm.id ? 'Novo PIN' : 'PIN inicial'}</span>
                        <input value={accessForm.pin} onChange={(e) => setAccessForm({ ...accessForm, pin: e.target.value })} type="password" inputMode="numeric" placeholder={accessForm.id ? 'Opcional' : '4 a 12 números'} />
                      </label>
                      <label className="check-row access-active-check full">
                        <input type="checkbox" checked={accessForm.active} onChange={(e) => setAccessForm({ ...accessForm, active: e.target.checked })} disabled={Boolean(accessFormIsSelf)} />
                        <span>Usuário ativo</span>
                      </label>
                      <label className="check-row access-active-check full">
                        <input
                          type="checkbox"
                          checked={accessProfessionalChecked()}
                          onChange={(e) => setAccessForm({ ...accessForm, isProfessional: e.target.checked })}
                          disabled={accessForm.role === 'BARBER'}
                        />
                        <span>Também atende clientes</span>
                      </label>
                    </div>
                    <div className="heading-actions access-actions">
                      {accessForm.id && <button className="btn soft" type="button" onClick={resetAccessForm}>Novo</button>}
                      <button className="btn primary" type="button" onClick={handleAccessSave} disabled={accessSaving}>
                        <UserPlus size={16} /> {accessSaving ? 'Salvando...' : accessForm.id ? 'Salvar acesso' : 'Criar acesso'}
                      </button>
                    </div>
                  </div>

                  <div className="access-editor-card">
                    <div className="panel-subtitle">Trocar meu PIN</div>
                    <div className="form-grid">
                      <label>
                        <span>PIN atual</span>
                        <input value={pinForm.currentPin} onChange={(e) => setPinForm({ ...pinForm, currentPin: e.target.value })} type="password" inputMode="numeric" />
                      </label>
                      <label>
                        <span>Novo PIN</span>
                        <input value={pinForm.newPin} onChange={(e) => setPinForm({ ...pinForm, newPin: e.target.value })} type="password" inputMode="numeric" placeholder="4 a 12 números" />
                      </label>
                      <label className="full">
                        <span>Confirmar novo PIN</span>
                        <input value={pinForm.confirmPin} onChange={(e) => setPinForm({ ...pinForm, confirmPin: e.target.value })} type="password" inputMode="numeric" />
                      </label>
                    </div>
                    <button className="btn soft full" type="button" onClick={handleOwnPinChange} disabled={pinSaving}>
                      <KeyRound size={16} /> {pinSaving ? 'Alterando...' : 'Alterar meu PIN'}
                    </button>
                  </div>

                  <div className="security-note access-security-note">
                    <ShieldCheck size={18} />
                    <span>PINs não são exibidos no painel. O gestor pode redefinir um PIN novo, mas não consultar o PIN atual.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>

        <div className="settings-side-stack">
          {showBrandPreview && (
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
          )}

          {showPixPreview && (
            <div className="panel-card settings-side-card pix-preview-card">
            <div className="settings-icon"><CreditCard size={24} /></div>
            <h3>Prévia do Pix</h3>
            <p>{form.paymentEnabled && form.paymentMode !== 'DISABLED' ? getPaymentModeLabel(form.paymentMode) : 'Pix desativado para clientes.'}</p>
            {form.paymentEnabled && form.pixKey ? (
              <>
                <div className="pix-mini-summary">
                  <span>Recebedor: <strong>{form.pixReceiverName || form.name || 'Não informado'}</strong></span>
                  <span>Cidade: <strong>{form.pixReceiverCity || 'Não informada'}</strong></span>
                  <span>Valor teste: <strong>{formatMoney(pixPreviewAmount)}</strong></span>
                </div>
                {pixPreviewPayload && <div className="qr-box"><img src={pixQrCodeUrl(pixPreviewPayload)} alt="QR Code Pix de teste" /></div>}
                <button className="btn soft full" type="button" onClick={() => copyText(pixPreviewPayload, 'Pix copia e cola de teste copiado.')}><Copy size={16} /> Copiar Pix teste</button>
              </>
            ) : (
              <div className="empty-state small"><KeyRound size={18} /> Configure a chave Pix para gerar QR Code.</div>
            )}
            </div>
          )}

          {showLinkCard && (
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
          )}

          {showInstagramCard && (
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
