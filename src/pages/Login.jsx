import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, LockKeyhole, Scissors } from 'lucide-react'
import { loginWithPin, publicGetBranding } from '../lib/api'
import { applyDocumentBrand, buildThemeStyle, normalizeUrl, publicBookingLink } from '../lib/branding'

export default function Login({ onLogin, showToast, forcedShopSlug = '' }) {
  const defaultSlug = import.meta.env.VITE_DEFAULT_SHOP_SLUG || 'barbearia-demo'
  const [shopSlug, setShopSlug] = useState(forcedShopSlug || defaultSlug)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [brand, setBrand] = useState(null)

  useEffect(() => {
    if (forcedShopSlug) setShopSlug(forcedShopSlug)
  }, [forcedShopSlug])

  useEffect(() => {
    const slug = (shopSlug || defaultSlug).trim().toLowerCase()
    if (!slug) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const data = await publicGetBranding(slug)
        if (!cancelled && data?.slug) {
          setBrand(data)
          applyDocumentBrand(data)
        }
      } catch {
        if (!cancelled) setBrand(null)
      }
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [shopSlug, defaultSlug])

  const publicLink = useMemo(() => publicBookingLink(shopSlug || defaultSlug), [shopSlug, defaultSlug])
  const logoUrl = normalizeUrl(brand?.logo_url)
  const themeStyle = buildThemeStyle(brand || {})

  async function handleSubmit(e) {
    e.preventDefault()
    if (!shopSlug.trim() || !pin.trim()) {
      showToast('Informe a barbearia e o PIN.', 'error')
      return
    }
    setLoading(true)
    try {
      const cleanSlug = shopSlug.trim().toLowerCase()
      const result = await loginWithPin(cleanSlug, pin.trim())
      if (!result?.session_token) throw new Error('Login não retornou sessão.')
      onLogin(result)
    } catch (error) {
      showToast(error.message || 'PIN inválido.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page branded-login" style={themeStyle}>
      <div className="login-orb orb-1" />
      <div className="login-orb orb-2" />
      <motion.div className="login-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className={`login-logo ${logoUrl ? 'with-image' : ''}`}>
          {logoUrl ? <img src={logoUrl} alt={`Logo ${brand?.name || 'Barbearia'}`} /> : <Scissors size={34} />}
        </div>
        <span className="eyebrow centered">Agenda premium</span>
        <h1>{brand?.name || 'Barbearia Agenda'}</h1>
        <p>{brand?.slogan || 'Entre com o PIN do administrador ou barbeiro para acessar o painel interno.'}</p>

        <form onSubmit={handleSubmit} className="form-stack">
          <label>
            <span>Identificador da barbearia</span>
            <input value={shopSlug} onChange={(e) => setShopSlug(e.target.value)} placeholder="barbearia-demo" autoComplete="organization" disabled={Boolean(forcedShopSlug)} />
          </label>
          <label>
            <span>PIN de acesso</span>
            <div className="input-icon">
              <LockKeyhole size={18} />
              <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Digite o PIN" type="password" inputMode="numeric" autoComplete="current-password" autoFocus />
            </div>
          </label>
          <button className="btn primary full" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar no painel'}
          </button>
        </form>

        <div className="demo-box">
          <strong>Acessos da barbearia</strong>
          <span>Painel interno: /app/{shopSlug || defaultSlug}</span>
          <span>Agendamento público: /agendar/{shopSlug || defaultSlug}</span>
          <a className="mini-link" href={publicLink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir link público</a>
        </div>
      </motion.div>
    </div>
  )
}
