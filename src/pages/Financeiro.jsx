import { useEffect, useState } from 'react'
import { Banknote, CalendarDays, CheckCircle2, Clock3, Scissors, UserRound, WalletCards } from 'lucide-react'
import StatCard from '../components/StatCard'
import { getFinancialReport } from '../lib/api'
import { formatDateBR, formatMoney, todayISO } from '../lib/dates'

function currentMonth() {
  return todayISO().slice(0, 7)
}

function statusLabel(status) {
  const labels = {
    PENDENTE_CONFIRMACAO: 'Pendente',
    AGENDADO: 'Agendado',
    CONFIRMADO: 'Confirmado',
    EM_ATENDIMENTO: 'Em atendimento',
    CONCLUIDO: 'Concluído',
    CANCELADO: 'Cancelado',
    FALTOU: 'Faltou',
  }

  return labels[status] || status || '-'
}

export default function Financeiro({ session, showToast }) {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setData(await getFinancialReport(session.session_token, month))
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [month])

  const stats = data?.stats || {}
  const byDay = data?.by_day || []
  const byBarber = data?.by_barber || []
  const byService = data?.by_service || []
  const appointments = data?.appointments || []

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Caixa e relatórios</span>
          <h2>Financeiro</h2>
          <p>Acompanhe faturamento mensal, recebidos, pendências e ranking de serviços/barbeiros.</p>
        </div>
        <div className="heading-actions">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn soft" type="button" onClick={load}>Atualizar</button>
        </div>
      </div>

      {loading && <div className="loading-card">Carregando relatório financeiro...</div>}

      <div className="stats-grid four">
        <StatCard icon={Banknote} label="Previsto no mês" value={formatMoney(stats.estimated_revenue || 0)} hint="Agendamentos não cancelados" />
        <StatCard icon={CheckCircle2} label="Recebido" value={formatMoney(stats.received_revenue || 0)} hint="Atendimentos concluídos" />
        <StatCard icon={Clock3} label="A receber" value={formatMoney(stats.pending_revenue || 0)} hint="Agendado/confirmado/em atendimento" />
        <StatCard icon={WalletCards} label="Pix pendente" value={formatMoney(stats.pix_pending_amount || 0)} hint={`${stats.pix_pending_count || 0} pagamento(s)`} />
      </div>

      <div className="stats-grid four compact-stats">
        <StatCard icon={CalendarDays} label="Agendamentos" value={stats.total_appointments || 0} hint="Total do mês" />
        <StatCard icon={CheckCircle2} label="Concluídos" value={stats.completed || 0} hint="Finalizados" />
        <StatCard icon={CalendarDays} label="Cancelados" value={stats.canceled || 0} hint="Cancelados" />
        <StatCard icon={CalendarDays} label="Faltas" value={stats.no_show || 0} hint="Não compareceu" />
      </div>

      <div className="report-grid">
        <section className="panel-card">
          <div className="panel-title"><h3>Receita por barbeiro</h3><span>{byBarber.length} registro(s)</span></div>
          <div className="finance-table">
            {byBarber.length === 0 && <div className="empty-state">Nenhum dado para este mês.</div>}
            {byBarber.map((item) => (
              <div className="finance-row report-row" key={item.barber_name}>
                <span><UserRound size={15} /> {item.barber_name}</span>
                <small>{item.completed || 0} concluído(s) • {item.total || 0} total</small>
                <strong>{formatMoney(item.received || 0)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-title"><h3>Serviços mais vendidos</h3><span>{byService.length} serviço(s)</span></div>
          <div className="finance-table">
            {byService.length === 0 && <div className="empty-state">Nenhum serviço no mês.</div>}
            {byService.map((item) => (
              <div className="finance-row report-row" key={item.service_name}>
                <span><Scissors size={15} /> {item.service_name}</span>
                <small>{item.total || 0} agendamento(s)</small>
                <strong>{formatMoney(item.received || 0)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel-card wide">
        <div className="panel-title"><h3>Resumo por dia</h3><span>{byDay.length} dia(s)</span></div>
        <div className="finance-table monthly-table">
          {byDay.length === 0 && <div className="empty-state">Nenhum movimento neste mês.</div>}
          {byDay.map((item) => (
            <div className="finance-row monthly-row" key={item.date}>
              <span>{formatDateBR(item.date)}</span>
              <small>{item.total || 0} agendamento(s) • {item.completed || 0} concluído(s)</small>
              <b>Previsto: {formatMoney(item.estimated || 0)}</b>
              <strong>Recebido: {formatMoney(item.received || 0)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel-card wide">
        <div className="panel-title"><h3>Movimentos do mês</h3><span>{appointments.length} registro(s)</span></div>
        <div className="finance-table">
          {appointments.length === 0 && <div className="empty-state">Nenhum agendamento neste mês.</div>}
          {appointments.map((item) => (
            <div className="finance-row detailed-finance-row" key={item.id}>
              <span><b>{formatDateBR(item.date)}</b> • {item.start_time?.slice(0, 5)}</span>
              <span>{item.client_name}</span>
              <small>{item.service_name} • {item.barber_name}</small>
              <small>{statusLabel(item.status)} • Pix: {item.payment_status || 'NAO_EXIGIDO'}</small>
              <strong>{formatMoney(item.price || 0)}</strong>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}
