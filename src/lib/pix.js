function removeAccents(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function onlyAscii(value = '', max = 99) {
  return removeAccents(value)
    .replace(/[^A-Za-z0-9 .,@+\-_/]/g, '')
    .trim()
    .slice(0, max)
}

function tlv(id, value) {
  const text = String(value ?? '')
  return `${id}${String(text.length).padStart(2, '0')}${text}`
}

function crc16(payload) {
  let crc = 0xffff

  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8
    for (let j = 0; j < 8; j += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021
      } else {
        crc <<= 1
      }
      crc &= 0xffff
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function normalizePixKey(value = '', keyType = '') {
  const raw = String(value || '').trim()
  const type = String(keyType || '').toUpperCase()

  if (!raw) return ''

  if (['PHONE', 'TELEFONE', 'CELULAR'].includes(type)) {
    const digits = raw.replace(/\D/g, '')

    if (raw.startsWith('+')) return `+${digits}`
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return `+${digits}`
    if (digits.length === 10 || digits.length === 11) return `+55${digits}`

    return raw
  }

  return raw
}

export function getPaymentModeLabel(mode) {
  const value = String(mode || 'DISABLED').toUpperCase()
  if (value === 'OPTIONAL') return 'Pix opcional'
  if (value === 'REQUIRED') return 'Pix obrigatório'
  if (value === 'DEPOSIT') return 'Sinal para reservar'
  return 'Pagamento desativado'
}

export function getPaymentStatusLabel(status) {
  const value = String(status || 'NAO_EXIGIDO').toUpperCase()
  if (value === 'PENDENTE') return 'Pagamento pendente'
  if (value === 'PAGO') return 'Pagamento recebido'
  if (value === 'CANCELADO') return 'Pagamento cancelado'
  return 'Pagamento não exigido'
}

export function getPaymentStatusClass(status) {
  const value = String(status || 'NAO_EXIGIDO').toUpperCase()
  if (value === 'PENDENTE') return 'pending'
  if (value === 'PAGO') return 'paid'
  if (value === 'CANCELADO') return 'canceled'
  return 'none'
}

export function calculatePaymentAmount(shop = {}, servicePrice = 0) {
  const mode = String(shop?.payment_mode || 'DISABLED').toUpperCase()
  const total = Number(servicePrice || 0)

  if (!shop?.payment_enabled || mode === 'DISABLED' || total <= 0) return 0

  if (mode === 'DEPOSIT') {
    const depositType = String(shop?.deposit_type || 'PERCENT').toUpperCase()
    const depositValue = Number(shop?.deposit_value || 0)

    if (depositType === 'FIXED') {
      return Math.max(0, Math.min(total, depositValue))
    }

    const percent = Math.max(0, Math.min(100, depositValue || 0))
    return Math.round((total * (percent / 100)) * 100) / 100
  }

  return total
}

export function shouldShowPayment(shop = {}, paymentAmount = 0) {
  return Boolean(shop?.payment_enabled && normalizePixKey(shop?.pix_key, shop?.pix_key_type) && Number(paymentAmount || 0) > 0)
}

export function buildPixPayload({ pixKey, pixKeyType, receiverName, receiverCity, amount, txid, description }) {
  const key = normalizePixKey(pixKey, pixKeyType)
  if (!key) return ''

  const merchantName = onlyAscii(receiverName || 'BARBEARIA', 25).toUpperCase() || 'BARBEARIA'
  const merchantCity = onlyAscii(receiverCity || 'BRASIL', 15).toUpperCase() || 'BRASIL'
  const cleanTxid = onlyAscii(txid || '***', 25) || '***'
  const cleanDescription = onlyAscii(description || '', 50)
  const numericAmount = Number(amount || 0)

  let merchantAccount = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', key)
  if (cleanDescription) merchantAccount += tlv('02', cleanDescription)

  let payload = ''
  payload += tlv('00', '01')
  payload += tlv('26', merchantAccount)
  payload += tlv('52', '0000')
  payload += tlv('53', '986')
  if (numericAmount > 0) payload += tlv('54', numericAmount.toFixed(2))
  payload += tlv('58', 'BR')
  payload += tlv('59', merchantName)
  payload += tlv('60', merchantCity)
  payload += tlv('62', tlv('05', cleanTxid))

  const withoutCrc = `${payload}6304`
  return `${withoutCrc}${crc16(withoutCrc)}`
}

export function pixQrCodeUrl(payload, size = 320) {
  if (!payload) return ''
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`
}
