import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarCheck, Copy, Instagram, LockKeyhole, MapPin, MessageCircle, QrCode, Scissors, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { publicGetBranding } from '../lib/api'
import { applyDocumentBrand, buildThemeStyle, instagramUrl, normalizeUrl, whatsappLink } from '../lib/branding'

function getPortalSlug(fallbackSlug) {
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts[0] && !['app', 'agendar', 'master'].includes(parts[0])) return parts[0]
  return fallbackSlug || import.meta.env.VITE_DEFAULT_SHOP_SLUG || 'barbearia-demo'
}

function buildUrl(path) {
  return `${window.location.origin}${path}`
}

export default function BarbershopPortal({ showToast, fallbackSlug }) {
  const [slug] = useState(getPortalSlug(fallbackSlug))
  const [shop, setShop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const logoUrl = normalizeUrl(shop?.logo_url)
  const coverUrl = normalizeUrl(shop?.cover_url)
  const themeStyle = buildThemeStyle(shop || {})
  const instagramHref = instagramUrl(shop?.instagram)

  const urls = useMemo(() => ({
    portal: buildUrl(`/${slug}`),
    booking: buildUrl(`/agendar/${slug}`),
    panel: buildUrl(`/app/${slug}`),
  }), [slug])

  async function copyText(text, label = 'Link copiado com sucesso.') {
    try {
      await navigator.clipboard.writeText(text)
      showToast(label)
    } catch {
      showToast('Não foi possível copiar automaticamente. Copie manualmente.', 'error')
    }
  }

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError('')

      try {
        const data = await publicGetBranding(slug)
        if (!alive) return
        setShop(data)
        applyDocumentBrand(data)
      } catch (err) {
        if (!alive) return
        setError(err.message || 'Não foi possível carregar esta barbearia.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()

    return () => { alive = false }
  }, [slug])

  if (loading) {
    return (
      <div className="portal-page" style={themeStyle}>
        <div className="portal-loading-card">
          <div className="loading-spinner" />
          <strong>Carregando barbearia...</strong>
          <span>Preparando a experiência de acesso.</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="portal-page" style={themeStyle}>
        <div className="portal-loading-card portal-error-card">
          <div className="portal-mark"><Scissors size={26} /></div>
          <strong>Barbearia não encontrada</strong>
          <span>{error}</span>
          <a className="btn primary full" href="/">Voltar para o início</a>
        </div>
      </div>
    )
  }

  const blocked = shop?.subscription_blocked === true
  const bookingDisabled = shop?.public_booking_enabled === false || blocked

  return (
    <div className="portal-page branded-public" style={themeStyle}>
      <div className="public-orb one" />
      <div className="public-orb two" />

      <motion.main className="portal-shell" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <section
          className="portal-hero"
          style={{ backgroundImage: coverUrl ? `linear-gradient(135deg, rgba(0,0,0,.2), rgba(0,0,0,.9)), url(${coverUrl})` : undefined }}
        >
          <div className="portal-hero-top">
            <div className={`portal-logo ${logoUrl ? 'with-image' : ''}`}>
              {logoUrl ? <img src={logoUrl} alt={`Logo ${shop?.name || 'Barbearia'}`} /> : <Scissors size={34} />}
            </div>
            <span className="portal-chip"><Sparkles size={15} /> Agendamento online</span>
          </div>

          <div className="portal-hero-content">
            <span className="eyebrow">Bem-vindo</span>
            <h1>{shop?.name || 'Barbearia'}</h1>
            <p>{shop?.slogan || 'Escolha como deseja acessar: agende seu horário como cliente ou entre no painel da barbearia.'}</p>
          </div>

          <div className="portal-info-grid">
            {shop?.opening_hours_text && <div><CalendarCheck size={17} /><span>{shop.opening_hours_text}</span></div>}
            {shop?.address && <div><MapPin size={17} /><span>{shop.address}</span></div>}
            {shop?.phone && <div><MessageCircle size={17} /><span>WhatsApp disponível</span></div>}
          </div>
        </section>

        <section className="portal-access-card">
          <div className="portal-access-heading">
            <span className="eyebrow">Acesso rápido</span>
            <h2>Como deseja continuar?</h2>
            <p>Use este único link para clientes e equipe da barbearia.</p>
          </div>

          {blocked && (
            <div className="portal-warning">
              <ShieldCheck size={18} />
              <span>Esta barbearia está temporariamente bloqueada. Entre em contato com o suporte da plataforma.</span>
            </div>
          )}

          <div className="portal-action-grid">
            <a className={`portal-action-card portal-action-client ${bookingDisabled ? 'disabled' : ''}`} href={bookingDisabled ? undefined : `/agendar/${slug}`} onClick={(e) => { if (bookingDisabled) e.preventDefault() }}>
              <div className="portal-action-icon client"><UserRound size={32} /></div>
              <div>
                <span className="portal-action-kicker">Cliente</span>
                <strong>Agendar horário</strong>
                <span>Escolha serviço, barbeiro, data e horário em poucos segundos.</span>
              </div>
              <em>{bookingDisabled ? 'Indisponível' : 'Começar agendamento'}</em>
            </a>

            <a className="portal-action-card portal-action-barber" href={`/app/${slug}`}>
              <div className="portal-action-icon barber"><LockKeyhole size={24} /></div>
              <div>
                <span className="portal-action-kicker">Equipe</span>
                <strong>Entrar no painel</strong>
                <span>Acesso de barbeiro ou administrador.</span>
              </div>
              <em>Usar PIN</em>
            </a>
          </div>

          <div className="portal-secondary-actions">
            {shop?.phone && <a href={whatsappLink(shop.phone, `Olá! Vim pelo link da ${shop?.name || 'barbearia'}.`)} target="_blank" rel="noreferrer"><MessageCircle size={16} /> WhatsApp</a>}
            {instagramHref && <a href={instagramHref} target="_blank" rel="noreferrer"><Instagram size={16} /> Instagram</a>}
            <button type="button" onClick={() => copyText(urls.portal, 'Link da barbearia copiado.')}><Copy size={16} /> Copiar link</button>
            <button type="button" onClick={() => copyText(urls.booking, 'Link de agendamento copiado.')}><QrCode size={16} /> Copiar agendamento</button>
          </div>
        </section>
      </motion.main>
    </div>
  )
}
