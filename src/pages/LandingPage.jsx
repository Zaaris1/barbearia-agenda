import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BarChart3, CalendarCheck, CheckCircle2, Clock3, Copy, CreditCard, LockKeyhole, MessageCircle, QrCode, Scissors, ShieldCheck, Smartphone, Sparkles, UsersRound } from 'lucide-react'
import { whatsappLink } from '../lib/branding'

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
}

const productHighlights = [
  { icon: CalendarCheck, label: 'Agenda online', text: 'Página pública para o cliente escolher serviço, profissional, data e horário.' },
  { icon: MessageCircle, label: 'WhatsApp no fluxo', text: 'Confirmação, lembrete, cancelamento e contato com a barbearia sem bagunça.' },
  { icon: CreditCard, label: 'Pix manual', text: 'Sinal ou pagamento completo com instruções e cópia do código Pix.' },
  { icon: BarChart3, label: 'Gestão do dono', text: 'Visão de agenda, clientes, serviços, financeiro e equipe em um painel.' },
]

const roleCards = [
  { icon: ShieldCheck, label: 'Dono da barbearia', text: 'Controla operação, configura marca, links, serviços, profissionais, Pix e mensalidade.' },
  { icon: Scissors, label: 'Profissional', text: 'Pode atender e acompanhar a própria agenda sem ganhar acesso ao que é administrativo.' },
  { icon: Smartphone, label: 'Cliente final', text: 'Agenda pelo celular, consulta horários e fala com a barbearia quando precisa.' },
]

const proofItems = [
  'Link público da barbearia',
  'Painel interno por PIN',
  'Cargos flexíveis',
  'Fluxo sem atendente obrigatório',
  'Área do cliente',
  'Pronto para várias barbearias',
]

export default function LandingPage({ showToast }) {
  const [slug, setSlug] = useState('')
  const cleanSlug = normalizeSlug(slug)

  const salesPhone = import.meta.env.VITE_SALES_WHATSAPP || ''
  const salesMessage = 'Olá! Tenho interesse no app de agenda para barbearias e quero saber como contratar.'
  const salesHref = useMemo(() => whatsappLink(salesPhone, salesMessage), [salesPhone])

  useEffect(() => {
    document.title = 'Agenda para Barbearias | App de agendamento'
  }, [])

  async function copySalesMessage() {
    try {
      await navigator.clipboard.writeText(salesMessage)
      showToast('Mensagem de contato copiada.')
    } catch {
      showToast('Não foi possível copiar automaticamente.', 'error')
    }
  }

  function goToPortal(type) {
    if (!cleanSlug) {
      showToast('Informe o link da barbearia.', 'error')
      return
    }

    window.location.href = type === 'panel' ? `/app/${cleanSlug}` : `/${cleanSlug}`
  }

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/">
          <span><Scissors size={20} /></span>
          <strong>Agenda Barbearia</strong>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#produto">Produto</a>
          <a href="#operacao">Operação</a>
          <a href="#acesso">Acesso</a>
        </nav>
        <a className="landing-nav-cta" href="#acesso"><LockKeyhole size={16} /> Entrar</a>
      </header>

      <section className="landing-hero" style={{ backgroundImage: 'linear-gradient(90deg, rgba(9,9,11,.96) 0%, rgba(9,9,11,.78) 42%, rgba(9,9,11,.28) 100%), url(/landing-app-preview.png)' }}>
        <div className="landing-hero-inner">
          <span className="landing-kicker"><Sparkles size={16} /> SaaS para barbearias</span>
          <h1>Agenda para Barbearias</h1>
          <p>Um app pronto para vender agendamento online, organizar profissionais, controlar pagamentos e entregar uma experiência simples para o cliente final.</p>
          <div className="landing-hero-actions">
            {salesHref ? (
              <a className="landing-btn primary" href={salesHref} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Quero contratar</a>
            ) : (
              <button className="landing-btn primary" type="button" onClick={copySalesMessage}><Copy size={18} /> Copiar contato</button>
            )}
            <a className="landing-btn secondary" href="/barbearia-demo"><QrCode size={18} /> Ver portal demo</a>
          </div>
          <div className="landing-hero-metrics" aria-label="Destaques do produto">
            <span><strong>24h</strong><small>agendamento público</small></span>
            <span><strong>3 perfis</strong><small>dono, profissional e cliente</small></span>
            <span><strong>Pix</strong><small>sinal ou pagamento</small></span>
          </div>
        </div>
      </section>

      <section className="landing-strip" aria-label="Recursos rápidos">
        {proofItems.map((item) => <span key={item}><CheckCircle2 size={16} /> {item}</span>)}
      </section>

      <section className="landing-section" id="produto">
        <div className="landing-section-heading">
          <span className="landing-kicker">Produto</span>
          <h2>O essencial para uma barbearia vender horários sem perder controle</h2>
          <p>A experiência pública fica simples para o cliente; o painel interno continua completo para a equipe.</p>
        </div>

        <div className="landing-feature-grid">
          {productHighlights.map(({ icon: Icon, label, text }) => (
            <article className="landing-feature-card" key={label}>
              <Icon size={22} />
              <strong>{label}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-operation" id="operacao">
        <div className="landing-section-heading">
          <span className="landing-kicker">Operação</span>
          <h2>Funciona para barbearia pequena, equipe completa ou dono que também atende</h2>
        </div>

        <div className="landing-role-grid">
          {roleCards.map(({ icon: Icon, label, text }) => (
            <article className="landing-role-card" key={label}>
              <span><Icon size={24} /></span>
              <div>
                <strong>{label}</strong>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="landing-flow">
          <div><CalendarCheck size={21} /><strong>Cliente agenda</strong><span>Serviço, profissional, data e horário.</span></div>
          <div><Clock3 size={21} /><strong>Barbearia confirma</strong><span>O painel mostra tudo por status.</span></div>
          <div><BarChart3 size={21} /><strong>Dono acompanha</strong><span>Agenda, clientes, financeiro e equipe.</span></div>
        </div>
      </section>

      <section className="landing-section landing-access-section" id="acesso">
        <div className="landing-access-copy">
          <span className="landing-kicker">Acesso</span>
          <h2>Use o mesmo domínio para vender e para atender clientes existentes</h2>
          <p>Quem já tem uma barbearia cadastrada entra pelo link próprio. Quem está conhecendo o produto pode abrir a demonstração pública.</p>
        </div>

        <div className="landing-access-tool">
          <label>
            <span>Link da barbearia</span>
            <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="barbearia-do-joao" />
          </label>
          <div className="landing-access-actions">
            <button className="landing-btn primary" type="button" onClick={() => goToPortal('portal')}><ArrowRight size={18} /> Abrir portal</button>
            <button className="landing-btn secondary" type="button" onClick={() => goToPortal('panel')}><LockKeyhole size={18} /> Abrir painel</button>
          </div>
          <a className="landing-demo-link" href="/agendar/barbearia-demo"><CalendarCheck size={16} /> Ver página de agendamento demo</a>
        </div>
      </section>
    </main>
  )
}
