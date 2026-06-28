import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  DollarSign,
  Link2,
  LockKeyhole,
  MessageCircle,
  MoreVertical,
  Play,
  Scissors,
  Settings,
  Sparkles,
  User,
  UserCheck,
  Users,
} from 'lucide-react'
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

const heroMetrics = [
  { icon: CalendarDays, value: '24h', label: 'agenda pública' },
  { icon: Users, value: '3', label: 'perfis' },
  { icon: Sparkles, value: 'Pix', label: 'no fluxo' },
]

const panelMenu = [
  { icon: CalendarCheck, label: 'Dashboard', active: true },
  { icon: Clock3, label: 'Agenda' },
  { icon: Users, label: 'Clientes' },
  { icon: Sparkles, label: 'Serviços' },
  { icon: UserCheck, label: 'Profissionais' },
  { icon: DollarSign, label: 'Financeiro' },
  { icon: BarChart3, label: 'Relatórios' },
  { icon: Settings, label: 'Configurações' },
]

const panelStats = [
  { label: 'Agendamentos hoje', value: '28', hint: 'Total do dia', icon: CalendarCheck, tone: 'gold' },
  { label: 'Clientes confirmados', value: '22', hint: '78% do total', icon: UserCheck, tone: 'green' },
  { label: 'Faturamento do mês', value: 'R$ 8.450,00', hint: '+18% vs mês anterior', icon: DollarSign, tone: 'blue' },
  { label: 'Taxa de ocupação', value: '86%', hint: 'Muito bem!', icon: BarChart3, tone: 'green' },
]

const agendaRows = [
  ['09:00', 'João Silva', 'Corte Social', 'Confirmado'],
  ['10:00', 'Carlos Mendes', 'Barba + Corte', 'Confirmado'],
  ['11:00', 'Rafael Souza', 'Degradê', 'Confirmado'],
  ['13:00', 'Bruno Lima', 'Corte + Barba', 'A caminho'],
  ['14:00', 'Lucas Carvalho', 'Corte Social', 'Agendado'],
]

const benefitItems = [
  { icon: Link2, label: 'Link próprio' },
  { icon: LockKeyhole, label: 'Painel por PIN' },
  { icon: Sparkles, label: 'Pix' },
  { icon: User, label: 'Área do cliente' },
  { icon: Scissors, label: 'Dono também atende' },
]

const resultCards = [
  {
    icon: CalendarDays,
    title: 'Agenda inteligente',
    text: 'Organize horários, evite conflitos e receba confirmações automáticas.',
  },
  {
    icon: UserCheck,
    title: 'Clientes no centro',
    text: 'Histórico completo, favoritos e comunicação direta pelo app.',
  },
  {
    icon: BarChart3,
    title: 'Operação que dá lucro',
    text: 'Relatórios claros, controle financeiro e métricas que importam.',
  },
]

const mobileSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30']

function PanelMockup() {
  return (
    <div className="landing-panel-mockup" aria-label="Prévia do painel Agenda Barbearia">
      <aside className="landing-panel-sidebar">
        <div className="landing-panel-logo">
          <span><Scissors size={20} /></span>
          <strong>Agenda<br />Barbearia</strong>
        </div>

        <div className="landing-panel-menu">
          {panelMenu.map(({ icon: Icon, label, active }) => (
            <span className={active ? 'active' : ''} key={label}>
              <Icon size={15} />
              {label}
            </span>
          ))}
        </div>

        <span className="landing-help-pill"><CheckCircle2 size={15} /> Ajuda</span>
      </aside>

      <section className="landing-panel-main">
        <header className="landing-panel-topbar">
          <strong>Olá, Barbearia Elite <ChevronDown size={14} /></strong>
          <span><CalendarDays size={14} /> 18 de maio de 2024 <Bell size={16} /></span>
        </header>

        <div className="landing-panel-stats">
          {panelStats.map(({ icon: Icon, label, value, hint, tone }) => (
            <article className={`landing-panel-stat ${tone}`} key={label}>
              <span>
                <small>{label}</small>
                <strong>{value}</strong>
                <em>{hint}</em>
              </span>
              <i><Icon size={23} /></i>
            </article>
          ))}
        </div>

        <div className="landing-panel-grid">
          <article className="landing-agenda-card">
            <div className="landing-card-head">
              <strong>Agenda do dia</strong>
              <span>Sábado, 18 de maio</span>
            </div>
            <div className="landing-agenda-list">
              {agendaRows.map(([time, client, service, status]) => (
                <div className="landing-agenda-row" key={`${time}-${client}`}>
                  <span>{time}</span>
                  <strong>{client}</strong>
                  <small>{service}</small>
                  <em className={status === 'A caminho' ? 'moving' : status === 'Agendado' ? 'scheduled' : ''}>{status}</em>
                  <MoreVertical size={14} />
                </div>
              ))}
            </div>
            <footer>Próximo: 15:00 - Felipe Andrade (Degradê)</footer>
          </article>

          <div className="landing-side-widgets">
            <article className="landing-next-card">
              <span>Próximo agendamento</span>
              <div>
                <i><CheckCircle2 size={20} /></i>
                <strong>Carlos Mendes</strong>
                <small>10:00 - Barba + Corte</small>
              </div>
              <button type="button"><MessageCircle size={15} /> Enviar lembrete</button>
            </article>

            <article className="landing-revenue-card">
              <span>Faturamento do mês</span>
              <strong>R$ 8.450,00</strong>
              <svg viewBox="0 0 190 54" aria-hidden="true">
                <polyline points="2,42 24,34 48,36 72,22 96,26 120,18 148,20 188,10" />
              </svg>
              <div><small>Meta: R$ 12.000,00</small><b>70%</b></div>
              <i><span /></i>
            </article>
          </div>
        </div>
      </section>

      <aside className="landing-phone-mockup" aria-label="Prévia de agendamento mobile">
        <div className="landing-phone-top">
          <span />
          <Scissors size={19} />
        </div>
        <h3>Agende seu horário</h3>
        <p>Escolha o serviço</p>
        <div className="landing-phone-service">
          <span>Corte Masculino</span>
          <small>R$ 50,00</small>
        </div>
        <div className="landing-phone-date">
          <span>18 de maio</span>
          <small>Sábado</small>
        </div>
        <div className="landing-phone-slots">
          {mobileSlots.map((slot) => <span className={slot === '10:00' ? 'active' : ''} key={slot}>{slot}</span>)}
        </div>
        <button type="button">Confirmar horário</button>
        <small className="landing-phone-pix"><LockKeyhole size={12} /> Pagamento via Pix no app</small>
      </aside>
    </div>
  )
}

export default function LandingPage({ showToast }) {
  const [slug, setSlug] = useState('')
  const cleanSlug = normalizeSlug(slug)

  const salesPhone = import.meta.env.VITE_SALES_WHATSAPP || ''
  const salesMessage = 'Olá! Tenho interesse no app de agenda para barbearias e quero saber como contratar.'
  const salesHref = useMemo(() => whatsappLink(salesPhone, salesMessage), [salesPhone])

  useEffect(() => {
    document.title = 'Agenda online para Barbearias | App de agendamento'
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
          <strong><b>Agenda</b> <em>Barbearia</em></strong>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#produto">Produto</a>
          <a href="#operacao">Operação</a>
          <a href="#acesso">Acesso</a>
        </nav>
        <a className="landing-nav-cta" href="#acesso"><User size={17} /> Entrar</a>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-shell">
          <div className="landing-hero-copy">
            <span className="landing-kicker"><Sparkles size={15} /> Plataforma para barbearias</span>
            <h1><span>Agenda online</span><em>para barbearias</em></h1>
            <p>Gerencie agendamentos, clientes e pagamentos em um só app. Mais organização, mais tempo e mais vendas para o seu negócio.</p>
            <div className="landing-hero-actions">
              {salesHref ? (
                <a className="landing-btn primary" href={salesHref} target="_blank" rel="noreferrer"><CalendarCheck size={18} /> Quero vender com o app</a>
              ) : (
                <button className="landing-btn primary" type="button" onClick={copySalesMessage}><CalendarCheck size={18} /> Quero vender com o app</button>
              )}
              <a className="landing-btn secondary" href="/barbearia-demo"><Play size={18} /> Ver demonstração</a>
            </div>

            <div className="landing-hero-metrics" aria-label="Destaques do produto">
              {heroMetrics.map(({ icon: Icon, value, label }) => (
                <span key={value}>
                  <Icon size={24} />
                  <strong>{value}</strong>
                  <small>{label}</small>
                </span>
              ))}
            </div>
          </div>

          <PanelMockup />
        </div>
      </section>

      <section className="landing-strip" aria-label="Recursos rápidos">
        {benefitItems.map(({ icon: Icon, label }) => (
          <span key={label}><Icon size={19} /> {label}</span>
        ))}
      </section>

      <section className="landing-section landing-results" id="produto">
        <div className="landing-section-heading">
          <span className="landing-eyebrow">Recursos que geram resultados</span>
          <h2>Tudo que sua barbearia precisa, em um só lugar.</h2>
        </div>

        <div className="landing-feature-grid">
          {resultCards.map(({ icon: Icon, title, text }) => (
            <article className="landing-feature-card" key={title}>
              <Icon size={25} />
              <strong>{title}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-operation" id="operacao">
        <div className="landing-section-heading">
          <span className="landing-eyebrow">Operação</span>
          <h2>Funciona para o dono que atende sozinho e para barbearias com equipe.</h2>
        </div>

        <div className="landing-flow">
          <div><CalendarCheck size={21} /><strong>Cliente agenda</strong><span>Serviço, profissional, data e horário pelo link público.</span></div>
          <div><MessageCircle size={21} /><strong>Barbearia confirma</strong><span>Status, lembrete, Pix e contato ficam no fluxo da agenda.</span></div>
          <div><BarChart3 size={21} /><strong>Dono acompanha</strong><span>Clientes, faturamento, equipe e operação em um painel único.</span></div>
        </div>
      </section>

      <section className="landing-section landing-access-section" id="acesso">
        <div className="landing-access-copy">
          <span className="landing-eyebrow">Acesso</span>
          <h2>Entre pelo link da barbearia ou abra a demonstração pública.</h2>
          <p>Quem já usa o app acessa pelo endereço próprio. Quem está avaliando a plataforma pode testar a experiência demo.</p>
        </div>

        <div className="landing-access-tool">
          <label>
            <span>Link da barbearia</span>
            <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="barbearia-do-joao" />
          </label>
          <div className="landing-access-actions">
            <button className="landing-btn primary" type="button" onClick={() => goToPortal('portal')}><Link2 size={18} /> Abrir portal</button>
            <button className="landing-btn secondary" type="button" onClick={() => goToPortal('panel')}><LockKeyhole size={18} /> Abrir painel</button>
          </div>
          <a className="landing-demo-link" href="/agendar/barbearia-demo"><CalendarCheck size={16} /> Ver página de agendamento demo</a>
        </div>
      </section>
    </main>
  )
}
