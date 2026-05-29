import { CalendarClock, CheckCircle2, CircleDollarSign, Clock, CreditCard, Edit3, MessageCircle, PlayCircle, RotateCcw, Scissors, UserRound, XCircle } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { formatDateBR, formatMoney } from '../lib/dates'
import { getPaymentStatusClass, getPaymentStatusLabel } from '../lib/pix'

function whatsappLink(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return '#'
  const normalized = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${normalized}`
}

export default function AppointmentCard({ appointment, onStatus, onReschedule, onMarkPaid }) {
  const canConfirm = ['PENDENTE_CONFIRMACAO', 'AGENDADO'].includes(appointment.status)
  const canStart = ['AGENDADO', 'CONFIRMADO'].includes(appointment.status)
  const canFinish = appointment.status === 'EM_ATENDIMENTO'
  const canCancel = ['PENDENTE_CONFIRMACAO', 'AGENDADO', 'CONFIRMADO', 'EM_ATENDIMENTO'].includes(appointment.status)
  const canMiss = ['AGENDADO', 'CONFIRMADO'].includes(appointment.status)
  const canReschedule = ['PENDENTE_CONFIRMACAO', 'AGENDADO', 'CONFIRMADO'].includes(appointment.status)
  const paymentStatus = appointment.payment_status || 'NAO_EXIGIDO'
  const paymentAmount = Number(appointment.payment_amount || 0)
  const canMarkPaid = paymentStatus === 'PENDENTE'

  return (
    <article className="appointment-card">
      <div className="appointment-top">
        <div className="appointment-time">
          <Clock size={17} />
          <strong>{appointment.start_time?.slice(0, 5)} - {appointment.end_time?.slice(0, 5)}</strong>
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      <div className="appointment-main">
        <h3>{appointment.client_name}</h3>
        <a href={whatsappLink(appointment.client_phone)} target="_blank" rel="noreferrer" className="phone-link">
          <MessageCircle size={15} /> {appointment.client_phone || 'Sem telefone'}
        </a>
      </div>

      <div className="appointment-details">
        <span><Scissors size={15} /> {appointment.service_name}</span>
        <span><UserRound size={15} /> {appointment.barber_name}</span>
        <span><CalendarClock size={15} /> {formatDateBR(appointment.date)}</span>
        <span><CircleDollarSign size={15} /> {formatMoney(appointment.price)}</span>
      </div>

      <div className={`payment-pill ${getPaymentStatusClass(paymentStatus)}`}>
        <CreditCard size={15} />
        <span>{getPaymentStatusLabel(paymentStatus)}</span>
        {paymentAmount > 0 && <strong>{formatMoney(paymentAmount)}</strong>}
      </div>

      {appointment.payment_note && <p className="appointment-notes payment-note">Pagamento: {appointment.payment_note}</p>}
      {appointment.notes && <p className="appointment-notes">{appointment.notes}</p>}

      <div className="appointment-actions">
        {canConfirm && <button type="button" className="btn mini success" onClick={() => onStatus(appointment.id, 'CONFIRMADO')}><CheckCircle2 size={15} /> Confirmar</button>}
        {canStart && <button type="button" className="btn mini primary" onClick={() => onStatus(appointment.id, 'EM_ATENDIMENTO')}><PlayCircle size={15} /> Iniciar</button>}
        {canFinish && <button type="button" className="btn mini success" onClick={() => onStatus(appointment.id, 'CONCLUIDO')}><CheckCircle2 size={15} /> Concluir</button>}
        {canMarkPaid && <button type="button" className="btn mini success" onClick={() => onMarkPaid?.(appointment)}><CreditCard size={15} /> Pago</button>}
        {canReschedule && <button type="button" className="btn mini soft" onClick={() => onReschedule(appointment)}><Edit3 size={15} /> Remarcar</button>}
        {canMiss && <button type="button" className="btn mini warning" onClick={() => onStatus(appointment.id, 'FALTOU')}><RotateCcw size={15} /> Faltou</button>}
        {canCancel && <button type="button" className="btn mini danger" onClick={() => onStatus(appointment.id, 'CANCELADO')}><XCircle size={15} /> Cancelar</button>}
      </div>
    </article>
  )
}
