import { formatDateBR, formatMoney } from './dates'

export function normalizeWhatsappPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')

  if (!digits) return ''

  if (digits.startsWith('55')) return digits

  return `55${digits}`
}

export function buildWhatsappUrl(phone, message) {
  const normalized = normalizeWhatsappPhone(phone)

  if (!normalized) return ''

  return `https://wa.me/${normalized}?text=${encodeURIComponent(message || '')}`
}

function getAppointmentBase(appointment, barbershop = {}) {
  const shopName = barbershop?.name || appointment?.barbershop_name || 'Barbearia'
  const clientName = appointment?.client_name || 'cliente'
  const serviceName = appointment?.service_name || 'Serviço'
  const barberName = appointment?.barber_name || 'Barbeiro'
  const date = appointment?.date ? formatDateBR(appointment.date) : ''
  const startTime = appointment?.start_time?.slice(0, 5) || appointment?.startTime || ''
  const price = Number(appointment?.price || 0)
  const address = barbershop?.address || ''
  const phone = barbershop?.phone || ''

  return {
    shopName,
    clientName,
    serviceName,
    barberName,
    date,
    startTime,
    price,
    address,
    phone,
  }
}

export function buildConfirmationMessage(appointment, barbershop = {}) {
  const base = getAppointmentBase(appointment, barbershop)

  const lines = [
    `Olá, ${base.clientName}! ✅`,
    '',
    `Seu agendamento foi confirmado pela ${base.shopName}.`,
    '',
    `Serviço: ${base.serviceName}`,
    `Barbeiro: ${base.barberName}`,
    base.date ? `Data: ${base.date}` : '',
    base.startTime ? `Horário: ${base.startTime}` : '',
    base.price > 0 ? `Valor: ${formatMoney(base.price)}` : '',
    base.address ? `Endereço: ${base.address}` : '',
    '',
    'Te esperamos no horário marcado!'
  ].filter(Boolean)

  if (base.phone) {
    lines.push('', `Contato da barbearia: ${base.phone}`)
  }

  return lines.join('\n')
}

export function buildReminderMessage(appointment, barbershop = {}) {
  const base = getAppointmentBase(appointment, barbershop)

  const lines = [
    `Olá, ${base.clientName}! ⏰`,
    '',
    `Passando para lembrar do seu horário na ${base.shopName}.`,
    '',
    `Serviço: ${base.serviceName}`,
    `Barbeiro: ${base.barberName}`,
    base.date ? `Data: ${base.date}` : '',
    base.startTime ? `Horário: ${base.startTime}` : '',
    base.address ? `Endereço: ${base.address}` : '',
    '',
    'Qualquer imprevisto, responda esta mensagem para avisar a barbearia.'
  ].filter(Boolean)

  if (base.phone) {
    lines.push('', `Contato da barbearia: ${base.phone}`)
  }

  return lines.join('\n')
}

export function openWhatsappConfirmation(appointment, barbershop = {}) {
  const url = buildWhatsappUrl(
    appointment?.client_phone,
    buildConfirmationMessage(appointment, barbershop)
  )

  if (!url) {
    return false
  }

  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

export function openWhatsappReminder(appointment, barbershop = {}) {
  const url = buildWhatsappUrl(
    appointment?.client_phone,
    buildReminderMessage(appointment, barbershop)
  )

  if (!url) {
    return false
  }

  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
