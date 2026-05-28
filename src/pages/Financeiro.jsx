import { useEffect, useState } from 'react'
import { Banknote, CalendarClock, CheckCircle2, Scissors } from 'lucide-react'
import StatCard from '../components/StatCard'
import { getDashboard } from '../lib/api'
import { formatMoney, todayISO } from '../lib/dates'

export default function Financeiro({ session, showToast }) {
  const [date, setDate] = useState(todayISO())
  const [data, setData] = useState(null)

  async function load() {
    try {
      setData(await getDashboard(session.session_token, date))
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  useEffect(() => { load() }, [date])

  const stats = data?.stats || {}
  const appointments = data?.appointments || []
  const concluded = appointments.filter((a) => a.status === 'CONCLUIDO')

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Caixa diário</span>
          <h2>Financeiro</h2>
          <p>Resumo simples do faturamento previsto e recebido no dia.</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="stats-grid three">
        <StatCard icon={Banknote} label="Faturamento estimado" value={formatMoney(stats.estimated_revenue || 0)} hint="Agenda não cancelada" />
        <StatCard icon={CheckCircle2} label="Recebido" value={formatMoney(stats.received_revenue || 0)} hint="Atendimentos concluídos" />
        <StatCard icon={CalendarClock} label="Concluídos" value={stats.done || 0} hint="Serviços finalizados" />
      </div>

      <div className="panel-card wide">
        <div className="panel-title"><h3>Atendimentos concluídos</h3><span>{concluded.length} registro(s)</span></div>
        <div className="finance-table">
          {concluded.length === 0 && <div className="empty-state">Nenhum atendimento concluído nesta data.</div>}
          {concluded.map((item) => (
            <div className="finance-row" key={item.id}>
              <span><Scissors size={15} /> {item.service_name}</span>
              <b>{item.client_name}</b>
              <small>{item.barber_name}</small>
              <strong>{formatMoney(item.price)}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
