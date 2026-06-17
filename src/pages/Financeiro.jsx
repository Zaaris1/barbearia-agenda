import { useEffect, useMemo, useState } from 'react'
import { Banknote, CalendarDays, CheckCircle2, Clock3, Printer, Scissors, UserRound, WalletCards } from 'lucide-react'
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

function commissionRuleLabel(item) {
  if (!item?.commission_enabled) return 'Sem comissão'
  if (item.commission_type === 'FIXED') return `${formatMoney(item.commission_value || 0)} por concluído`
  return `${Number(item.commission_value || 0).toFixed(2).replace('.', ',')}%`
}

export default function Financeiro({ session, showToast, bootstrap }) {
  const [month, setMonth] = useState(currentMonth())
  const [selectedBarberId, setSelectedBarberId] = useState('')
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

  const selectedBarber = useMemo(() => {
    if (!selectedBarberId) return null
    return byBarber.find((item) => item.barber_id === selectedBarberId) || null
  }, [byBarber, selectedBarberId])

  const barberAppointments = useMemo(() => {
    if (!selectedBarberId) return []
    return appointments.filter((item) => item.barber_id === selectedBarberId)
  }, [appointments, selectedBarberId])

  function printReport() {
    window.print()
  }

  return (
    <section className="page-content print-finance-report">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Caixa e relatórios</span>
          <h2>Financeiro</h2>
          <p>Acompanhe faturamento mensal, comissão dos profissionais, recebidos, pendências e ranking de serviços.</p>
        </div>
        <div className="heading-actions">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn soft" type="button" onClick={load}>Atualizar</button>
          <button className="btn primary" type="button" onClick={printReport}><Printer size={16} /> Salvar PDF</button>
        </div>
      </div>

      <div className="print-only print-report-header">
        <h1>{bootstrap?.barbershop?.name || session?.barbershop?.name || 'Barbearia'}</h1>
        <p>Relatório financeiro mensal • Competência {month}</p>
        <small>Gerado em {new Date().toLocaleString('pt-BR')}</small>
      </div>

      {loading && <div className="loading-card">Carregando relatório financeiro...</div>}

      <div className="stats-grid four">
        <StatCard icon={Banknote} label="Previsto no mês" value={formatMoney(stats.estimated_revenue || 0)} hint="Agendamentos não cancelados" />
        <StatCard icon={CheckCircle2} label="Recebido" value={formatMoney(stats.received_revenue || 0)} hint="Atendimentos concluídos" />
        <StatCard icon={WalletCards} label="Comissões" value={formatMoney(stats.commission_total || 0)} hint="Valor estimado dos profissionais" />
        <StatCard icon={Clock3} label="Líquido estimado" value={formatMoney(stats.net_after_commission || 0)} hint="Recebido - comissões" />
      </div>

      <div className="stats-grid four compact-stats">
        <StatCard icon={CalendarDays} label="Agendamentos" value={stats.total_appointments || 0} hint="Total do mês" />
        <StatCard icon={CheckCircle2} label="Concluídos" value={stats.completed || 0} hint="Finalizados" />
        <StatCard icon={CalendarDays} label="A receber" value={formatMoney(stats.pending_revenue || 0)} hint="Em aberto" />
        <StatCard icon={WalletCards} label="Pix pendente" value={formatMoney(stats.pix_pending_amount || 0)} hint={`${stats.pix_pending_count || 0} pagamento(s)`} />
      </div>

      <div className="report-grid">
        <section className="panel-card">
          <div className="panel-title"><h3>Resultado por profissional</h3><span>{byBarber.length} registro(s)</span></div>
          <div className="finance-table">
            {byBarber.length === 0 && <div className="empty-state">Nenhum dado para este mês.</div>}
            {byBarber.map((item) => (
              <button type="button" className={`finance-row report-row barber-report-button ${selectedBarberId === item.barber_id ? 'active' : ''}`} key={item.barber_id || item.barber_name} onClick={() => setSelectedBarberId(selectedBarberId === item.barber_id ? '' : item.barber_id)}>
                <span><UserRound size={15} /> {item.barber_name}</span>
                <small>{item.completed || 0} concluído(s) • {commissionRuleLabel(item)}</small>
                <b>Comissão: {formatMoney(item.commission_amount || 0)}</b>
                <strong>Recebido: {formatMoney(item.received || 0)}</strong>
              </button>
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

      {selectedBarber && (
        <section className="panel-card wide barber-detail-report">
          <div className="panel-title">
            <h3>Relatório do profissional: {selectedBarber.barber_name}</h3>
            <span>{barberAppointments.length} movimento(s)</span>
          </div>
          <div className="barber-commission-summary">
            <div><small>Faturamento concluído</small><strong>{formatMoney(selectedBarber.received || 0)}</strong></div>
            <div><small>Comissão</small><strong>{formatMoney(selectedBarber.commission_amount || 0)}</strong></div>
            <div><small>Líquido da barbearia</small><strong>{formatMoney(selectedBarber.net_after_commission || 0)}</strong></div>
            <div><small>Regra</small><strong>{commissionRuleLabel(selectedBarber)}</strong></div>
          </div>
          <div className="finance-table">
            {barberAppointments.map((item) => (
              <div className="finance-row detailed-finance-row" key={item.id}>
                <span><b>{formatDateBR(item.date)}</b> • {item.start_time?.slice(0, 5)}</span>
                <span>{item.client_name}</span>
                <small>{item.service_name} • {statusLabel(item.status)}</small>
                <strong>{formatMoney(item.price || 0)}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

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
