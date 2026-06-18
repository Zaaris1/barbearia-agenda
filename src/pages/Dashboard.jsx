import { useEffect, useState } from 'react'
import { ArrowRight, CalendarCheck2, CheckCircle2, CircleAlert, Clock3, CreditCard, ExternalLink, Link2, MessageCircle, Scissors, Store, TrendingUp, UserCheck, Users, WalletCards } from 'lucide-react'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { formatMoney, todayISO } from '../lib/dates'
import { getDashboard } from '../lib/api'
import { publicBookingLink } from '../lib/branding'

function hasText(value) {
  return String(value || '').trim().length > 0
}

function activeItems(items = []) {
  return items.filter((item) => item?.active !== false)
}

function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`
}

function buildActivationChecklist(bootstrap, session) {
  const shop = bootstrap?.barbershop || session?.barbershop || {}
  const services = activeItems(bootstrap?.services_all || bootstrap?.services || [])
  const professionals = activeItems(bootstrap?.barbers_all || bootstrap?.barbers || [])
  const professionalsWithSchedule = professionals.filter((professional) => (
    hasText(professional?.start_time)
    && hasText(professional?.end_time)
    && Array.isArray(professional?.days_working)
    && professional.days_working.length > 0
  ))

  const profileReady = hasText(shop.name) && hasText(shop.slug) && hasText(shop.phone)
  const servicesReady = services.length > 0 && services.some((service) => Number(service?.price || 0) > 0)
  const professionalsReady = professionals.length > 0
  const scheduleReady = professionalsReady && professionalsWithSchedule.length > 0
  const paymentEnabled = shop?.payment_enabled === true && shop?.payment_mode !== 'DISABLED'
  const paymentReady = !paymentEnabled || (hasText(shop?.pix_key) && hasText(shop?.pix_receiver_name) && hasText(shop?.pix_receiver_city))
  const messagesReady = hasText(shop?.phone)
  const publicReady = shop?.public_booking_enabled !== false && hasText(shop?.slug) && services.length > 0 && professionalsReady && scheduleReady
  const servicesDetail = services.length === 0
    ? 'Cadastre pelo menos um serviço ativo.'
    : servicesReady
      ? `${countLabel(services.length, 'serviço ativo', 'serviços ativos')} no catálogo.`
      : 'Informe preço em pelo menos um serviço ativo.'
  const paymentDetail = paymentReady
    ? (paymentEnabled ? 'Pix configurado para o agendamento público.' : 'Pix desativado; clientes podem agendar sem cobrança no app.')
    : 'Informe chave Pix, recebedor e cidade.'

  const items = [
    {
      id: 'profile',
      title: 'Dados da barbearia',
      detail: profileReady ? 'Nome, link e WhatsApp prontos.' : 'Complete nome, link público e WhatsApp.',
      done: profileReady,
      icon: Store,
      page: 'configuracoes',
      tab: 'dados',
      actionLabel: 'Abrir dados',
    },
    {
      id: 'services',
      title: 'Serviços e preços',
      detail: servicesDetail,
      done: servicesReady,
      icon: Scissors,
      page: 'servicos',
      focus: 'services',
      actionLabel: 'Abrir serviços',
    },
    {
      id: 'team',
      title: 'Equipe de atendimento',
      detail: professionalsReady ? `${countLabel(professionals.length, 'profissional apto', 'profissionais aptos')} a receber agenda.` : 'Inclua quem atende, mesmo que seja só o gestor.',
      done: professionalsReady,
      icon: Users,
      page: 'barbeiros',
      focus: 'team',
      actionLabel: 'Abrir equipe',
    },
    {
      id: 'schedule',
      title: 'Horários de atendimento',
      detail: scheduleReady ? `${countLabel(professionalsWithSchedule.length, 'agenda com dias e horários', 'agendas com dias e horários')}.` : 'Defina dias, início e fim da jornada.',
      done: scheduleReady,
      icon: Clock3,
      page: 'barbeiros',
      focus: 'schedule',
      actionLabel: 'Ajustar horários',
    },
    {
      id: 'payment',
      title: 'Pagamento Pix',
      detail: paymentDetail,
      done: paymentReady,
      icon: CreditCard,
      page: 'configuracoes',
      tab: 'pix',
      actionLabel: 'Abrir Pix',
    },
    {
      id: 'messages',
      title: 'Mensagens de WhatsApp',
      detail: messagesReady ? 'WhatsApp pronto para confirmações e lembretes.' : 'Cadastre o WhatsApp da barbearia.',
      done: messagesReady,
      icon: MessageCircle,
      page: 'configuracoes',
      tab: 'mensagens',
      actionLabel: 'Abrir mensagens',
    },
    {
      id: 'public-link',
      title: 'Link público',
      detail: publicReady ? 'Pronto para compartilhar com clientes.' : 'Libere agenda pública, serviço e profissional com horário.',
      done: publicReady,
      icon: Link2,
      page: 'configuracoes',
      tab: 'dados',
      href: publicReady ? publicBookingLink(shop.slug) : '',
      actionLabel: publicReady ? 'Abrir link' : 'Abrir dados',
    },
  ]

  const doneCount = items.filter((item) => item.done).length
  const percent = Math.round((doneCount / items.length) * 100)

  return {
    items,
    doneCount,
    percent,
    nextItem: items.find((item) => !item.done) || null,
  }
}

function ActivationAction({ item, goToPage }) {
  if (item.href) {
    return (
      <a className="activation-action" href={item.href} target="_blank" rel="noreferrer">
        {item.actionLabel}
        <ExternalLink size={14} />
      </a>
    )
  }

  return (
    <button className="activation-action" type="button" onClick={() => goToPage?.(item.page, { source: 'activation', tab: item.tab, focus: item.focus || item.id, title: item.title })}>
      {item.actionLabel}
      <ArrowRight size={14} />
    </button>
  )
}

export default function Dashboard({ session, bootstrap, showToast, goToPage }) {
  const [date, setDate] = useState(todayISO())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const result = await getDashboard(session.session_token, date)
      setData(result)
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [date])

  const stats = data?.stats || {}
  const appointments = data?.appointments || []
  const topServices = data?.top_services || []
  const freeSlots = data?.next_free_slots || []
  const activation = session?.user?.role === 'ADMIN' && bootstrap ? buildActivationChecklist(bootstrap, session) : null
  const activationShop = bootstrap?.barbershop || session?.barbershop || {}
  const activationPublicLink = hasText(activationShop?.slug) ? publicBookingLink(activationShop.slug) : ''
  const activationComplete = Boolean(activation && !activation.nextItem && activationPublicLink)

  async function copyActivationPublicLink() {
    try {
      await navigator.clipboard.writeText(activationPublicLink)
      showToast('Link público copiado para compartilhar.')
    } catch {
      showToast('Não foi possível copiar automaticamente.', 'error')
    }
  }

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Resumo diário</span>
          <h2>Dashboard</h2>
          <p>Visão rápida dos atendimentos, horários e previsão do caixa.</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {activation && (
        <div className="panel-card activation-card">
          <div className="activation-summary">
            <div>
              <span className="eyebrow">Primeiros passos</span>
              <h3>Ativação da barbearia</h3>
              <p>{activation.nextItem ? `Próxima ação: ${activation.nextItem.title}.` : 'Tudo pronto para vender e receber agendamentos.'}</p>
            </div>
            <div className="activation-meter" aria-label={`Ativação ${activation.percent}% concluída`}>
              <strong>{activation.doneCount}/{activation.items.length}</strong>
              <span>{activation.percent}% pronto</span>
              <div className="activation-progress"><span style={{ width: `${activation.percent}%` }} /></div>
              {activationComplete && (
                <div className="activation-ready-actions">
                  <button className="activation-action" type="button" onClick={copyActivationPublicLink}>Copiar link</button>
                  <a className="activation-action" href={activationPublicLink} target="_blank" rel="noreferrer">Abrir link</a>
                </div>
              )}
            </div>
          </div>

          <div className="activation-list">
            {activation.items.map((item) => {
              const Icon = item.icon
              return (
                <div className={`activation-item ${item.done ? 'done' : 'pending'}`} key={item.id}>
                  <div className="activation-icon"><Icon size={18} /></div>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <div className="activation-state">
                    {item.done ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
                    <ActivationAction item={item} goToPage={goToPage} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="stats-grid">
        <StatCard icon={CalendarCheck2} label="Agendamentos" value={stats.total_appointments || 0} hint="Total do dia" />
        <StatCard icon={UserCheck} label="Confirmados" value={stats.confirmed || 0} hint="Clientes confirmados" />
        <StatCard icon={Clock3} label="Em atendimento" value={stats.in_progress || 0} hint="Agora" />
        <StatCard icon={Scissors} label="Concluídos" value={stats.done || 0} hint="Finalizados" />
        <StatCard icon={WalletCards} label="Estimado" value={formatMoney(stats.estimated_revenue || 0)} hint="Agenda ativa" />
        <StatCard icon={TrendingUp} label="Recebido" value={formatMoney(stats.received_revenue || 0)} hint="Concluídos" />
      </div>

      <div className="dashboard-grid">
        <div className="panel-card wide">
          <div className="panel-title">
            <h3>Agenda do dia</h3>
            <span>{loading ? 'Carregando...' : `${appointments.length} registro(s)`}</span>
          </div>
          <div className="compact-list">
            {appointments.length === 0 && <div className="empty-state">Nenhum agendamento para esta data.</div>}
            {appointments.map((item) => (
              <div className="compact-item" key={item.id}>
                <strong>{item.start_time?.slice(0, 5)}</strong>
                <div>
                  <b>{item.client_name}</b>
                  <span>{item.service_name} • {item.barber_name}</span>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-title">
            <h3>Próximos horários livres</h3>
            <span>Hoje</span>
          </div>
          <div className="slot-column">
            {freeSlots.length === 0 && <div className="empty-state small">Sem horários calculados.</div>}
            {freeSlots.slice(0, 8).map((slot, index) => (
              <div className="slot-pill" key={`${slot.barber_id}-${slot.start_time}-${index}`}>
                <span>{slot.start_time}</span>
                <small>{slot.barber_name}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-title">
            <h3>Serviços mais marcados</h3>
            <span>Ranking</span>
          </div>
          <div className="ranking-list">
            {topServices.length === 0 && <div className="empty-state small">Sem dados ainda.</div>}
            {topServices.map((service, index) => (
              <div className="ranking-row" key={service.service_name}>
                <span>{index + 1}</span>
                <b>{service.service_name}</b>
                <small>{service.total}x</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
