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
  const endTime = appointment?.end_time?.slice(0, 5) || appointment?.endTime || ''
  const price = Number(appointment?.price || 0)
  const address = barbershop?.address || ''
  const shopPhone = barbershop?.phone || ''
  const status = appointment?.status || ''
  const paymentStatus = appointment?.payment_status || appointment?.paymentStatus || ''
  const paymentAmount = Number(appointment?.payment_amount || appointment?.paymentAmount || 0)

  return {
    shopName,
    clientName,
    serviceName,
    barberName,
    date,
    startTime,
    endTime,
    price,
    address,
    shopPhone,
    status,
    paymentStatus,
    paymentAmount,
    priceText: price > 0 ? formatMoney(price) : '',
    paymentAmountText: paymentAmount > 0 ? formatMoney(paymentAmount) : '',
  }
}

function applyTemplate(template, base) {
  if (!template || !String(template).trim()) return ''

  return String(template)
    .replaceAll('{cliente}', base.clientName)
    .replaceAll('{barbearia}', base.shopName)
    .replaceAll('{servico}', base.serviceName)
    .replaceAll('{barbeiro}', base.barberName)
    .replaceAll('{data}', base.date)
    .replaceAll('{hora}', base.startTime)
    .replaceAll('{hora_fim}', base.endTime)
    .replaceAll('{valor}', base.priceText)
    .replaceAll('{endereco}', base.address)
    .replaceAll('{telefone_barbearia}', base.shopPhone)
    .replaceAll('{status}', base.status)
    .replaceAll('{pagamento}', base.paymentStatus)
    .replaceAll('{valor_pagamento}', base.paymentAmountText)
}

export function buildConfirmationMessage(appointment, barbershop = {}) {
  const base = getAppointmentBase(appointment, barbershop)
  const custom = applyTemplate(barbershop?.whatsapp_confirmation_template, base)
  if (custom) return custom

  const lines = [
    `Olá, ${base.clientName}! ✅`,
    '',
    `Seu agendamento foi confirmado pela ${base.shopName}.`,
    '',
    `Serviço: ${base.serviceName}`,
    `Barbeiro: ${base.barberName}`,
    base.date ? `Data: ${base.date}` : '',
    base.startTime ? `Horário: ${base.startTime}` : '',
    base.price > 0 ? `Valor: ${base.priceText}` : '',
    base.address ? `Endereço: ${base.address}` : '',
    '',
    'Te esperamos no horário marcado!'
  ].filter(Boolean)

  if (base.shopPhone) lines.push('', `Contato da barbearia: ${base.shopPhone}`)

  return lines.join('\n')
}

export function buildReminderMessage(appointment, barbershop = {}) {
  const base = getAppointmentBase(appointment, barbershop)
  const custom = applyTemplate(barbershop?.whatsapp_reminder_template, base)
  if (custom) return custom

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

  if (base.shopPhone) lines.push('', `Contato da barbearia: ${base.shopPhone}`)

  return lines.join('\n')
}

export function buildCancellationMessage(appointment, barbershop = {}) {
  const base = getAppointmentBase(appointment, barbershop)
  const custom = applyTemplate(barbershop?.whatsapp_cancellation_template, base)
  if (custom) return custom

  const lines = [
    `Olá, ${base.clientName}!`,
    '',
    `Seu agendamento na ${base.shopName} foi cancelado.`,
    '',
    `Serviço: ${base.serviceName}`,
    `Barbeiro: ${base.barberName}`,
    base.date ? `Data: ${base.date}` : '',
    base.startTime ? `Horário: ${base.startTime}` : '',
    '',
    'Para marcar um novo horário, acesse o link de agendamento ou fale conosco pelo WhatsApp.'
  ].filter(Boolean)

  if (base.shopPhone) lines.push('', `Contato da barbearia: ${base.shopPhone}`)

  return lines.join('\n')
}

export function openWhatsappConfirmation(appointment, barbershop = {}) {
  const url = buildWhatsappUrl(appointment?.client_phone, buildConfirmationMessage(appointment, barbershop))
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

export function openWhatsappReminder(appointment, barbershop = {}) {
  const url = buildWhatsappUrl(appointment?.client_phone, buildReminderMessage(appointment, barbershop))
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

export function openWhatsappCancellation(appointment, barbershop = {}) {
  const url = buildWhatsappUrl(appointment?.client_phone, buildCancellationMessage(appointment, barbershop))
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
