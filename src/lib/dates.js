export function todayISO() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDateBR(dateISO) {
  if (!dateISO) return '-'
  const [y, m, d] = dateISO.split('-')
  return `${d}/${m}/${y}`
}

export function formatMoney(value) {
  const n = Number(value || 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

export function timeToMinutes(time) {
  if (!time) return 0
  const [h, m] = String(time).slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
