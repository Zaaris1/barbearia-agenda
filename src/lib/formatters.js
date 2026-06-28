export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

export function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
}

export function formatPhoneInput(value) {
  let digits = onlyDigits(value)

  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2)
  }

  digits = digits.slice(0, 11)

  if (digits.length <= 2) return digits ? `(${digits}` : ''

  const area = digits.slice(0, 2)
  const body = digits.slice(2)

  if (body.length <= 4) return `(${area}) ${body}`
  if (digits.length <= 10) return `(${area}) ${body.slice(0, 4)}-${body.slice(4)}`

  return `(${area}) ${body.slice(0, 5)}-${body.slice(5)}`
}
