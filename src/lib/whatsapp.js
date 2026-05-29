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

export function buildConfirmationMessage(appointment, barbershop = {}) {
  const shopName = barbershop?.name || appointment?.barbershop_name || 'Barbearia'
  const clientName = appointment?.client_name || 'cliente'
  const serviceName = appointment?.service_name || 'Serviço'
  const barberName = appointment?.barber_name || 'Barbeiro'
  const date = appointment?.date ? formatDateBR(appointment.date) : ''
  const startTime = appointment?.start_time?.slice(0, 5) || appointment?.startTime || ''
  const price = Number(appointment?.price || 0)
  const address = barbershop?.address || ''
  const phone = barbershop?.phone || ''

  const lines = [
    `Olá, ${clientName}! ✅`,
    '',
    `Seu agendamento foi confirmado pela ${shopName}.`,
    '',
    `Serviço: ${serviceName}`,
    `Barbeiro: ${barberName}`,
    date ? `Data: ${date}` : '',
    startTime ? `Horário: ${startTime}` : '',
    price > 0 ? `Valor: ${formatMoney(price)}` : '',
    address ? `Endereço: ${address}` : '',
    '',
    'Te esperamos no horário marcado!'
  ].filter(Boolean)

  if (phone) {
    lines.push('', `Contato da barbearia: ${phone}`)
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
