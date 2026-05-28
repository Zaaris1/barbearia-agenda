import { useEffect, useState } from 'react'
import { CalendarCheck2, Clock3, Scissors, TrendingUp, UserCheck, WalletCards } from 'lucide-react'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { formatMoney, todayISO } from '../lib/dates'
import { getDashboard } from '../lib/api'

export default function Dashboard({ session, showToast }) {
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
