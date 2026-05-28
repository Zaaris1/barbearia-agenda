import { useState } from 'react'
import { motion } from 'framer-motion'
import { LockKeyhole, Scissors } from 'lucide-react'
import { loginWithPin } from '../lib/api'

export default function Login({ onLogin, showToast }) {
  const [shopSlug, setShopSlug] = useState(import.meta.env.VITE_DEFAULT_SHOP_SLUG || 'barbearia-demo')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!shopSlug.trim() || !pin.trim()) {
      showToast('Informe a barbearia e o PIN.', 'error')
      return
    }
    setLoading(true)
    try {
      const result = await loginWithPin(shopSlug.trim(), pin.trim())
      if (!result?.session_token) throw new Error('Login não retornou sessão.')
      onLogin(result)
    } catch (error) {
      showToast(error.message || 'PIN inválido.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-orb orb-1" />
      <div className="login-orb orb-2" />
      <motion.div className="login-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className="login-logo">
          <Scissors size={34} />
        </div>
        <span className="eyebrow centered">Agenda premium</span>
        <h1>Barbearia Agenda</h1>
        <p>Entre com o PIN do administrador ou barbeiro para acessar o painel interno.</p>

        <form onSubmit={handleSubmit} className="form-stack">
          <label>
            <span>Identificador da barbearia</span>
            <input value={shopSlug} onChange={(e) => setShopSlug(e.target.value)} placeholder="barbearia-demo" autoComplete="organization" />
          </label>
          <label>
            <span>PIN de acesso</span>
            <div className="input-icon">
              <LockKeyhole size={18} />
              <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Digite o PIN" type="password" inputMode="numeric" autoComplete="current-password" />
            </div>
          </label>
          <button className="btn primary full" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar no painel'}
          </button>
        </form>

        <div className="demo-box">
          <strong>Dados iniciais da demo</strong>
          <span>Barbearia: barbearia-demo</span>
          <span>Admin: 1234 • Barbeiro: 1111</span>
        </div>
      </motion.div>
    </div>
  )
}
