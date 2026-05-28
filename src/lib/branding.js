export const THEME_PRESETS = {
  classic_gold: {
    id: 'classic_gold',
    name: 'Classic Gold',
    description: 'Preto premium com dourado clássico.',
    primary_color: '#D4A857',
    secondary_color: '#0B0B0C',
    accent_color: '#F5C66A',
    bg_color: '#09090B',
    surface_color: '#151518',
    text_color: '#F5F5F5',
  },
  urban_black: {
    id: 'urban_black',
    name: 'Urban Black',
    description: 'Visual urbano, preto e vermelho queimado.',
    primary_color: '#B91C1C',
    secondary_color: '#111827',
    accent_color: '#EF4444',
    bg_color: '#070707',
    surface_color: '#171717',
    text_color: '#F9FAFB',
  },
  royal_barber: {
    id: 'royal_barber',
    name: 'Royal Barber',
    description: 'Luxo discreto com vinho e dourado.',
    primary_color: '#C8A24A',
    secondary_color: '#3B1020',
    accent_color: '#E8C56B',
    bg_color: '#0D0710',
    surface_color: '#1B1018',
    text_color: '#FFF7ED',
  },
  modern_blue: {
    id: 'modern_blue',
    name: 'Modern Blue',
    description: 'Moderno, tecnológico e limpo.',
    primary_color: '#38BDF8',
    secondary_color: '#0F172A',
    accent_color: '#22D3EE',
    bg_color: '#020617',
    surface_color: '#0F172A',
    text_color: '#F8FAFC',
  },
  vintage_brown: {
    id: 'vintage_brown',
    name: 'Vintage Brown',
    description: 'Barbearia clássica, couro e madeira.',
    primary_color: '#C08457',
    secondary_color: '#2A1710',
    accent_color: '#F2C078',
    bg_color: '#120A06',
    surface_color: '#20130D',
    text_color: '#FFF7ED',
  },
}

export const DEFAULT_THEME = THEME_PRESETS.classic_gold

export function presetOptions() {
  return Object.values(THEME_PRESETS)
}

export function themeFromShop(shop = {}) {
  const preset = THEME_PRESETS[shop?.preset_theme] || DEFAULT_THEME
  return {
    ...preset,
    primary_color: shop?.primary_color || preset.primary_color,
    secondary_color: shop?.secondary_color || preset.secondary_color,
    accent_color: shop?.accent_color || preset.accent_color,
    bg_color: shop?.bg_color || preset.bg_color,
    surface_color: shop?.surface_color || preset.surface_color,
    text_color: shop?.text_color || preset.text_color,
  }
}

export function buildThemeStyle(shop = {}) {
  const theme = themeFromShop(shop)
  return {
    '--brand-primary': theme.primary_color,
    '--brand-secondary': theme.secondary_color,
    '--brand-accent': theme.accent_color,
    '--brand-bg': theme.bg_color,
    '--brand-surface': theme.surface_color,
    '--brand-text': theme.text_color,
  }
}

export function applyDocumentBrand(shop = {}) {
  if (!shop) return

  const theme = themeFromShop(shop)
  const root = document.documentElement
  root.style.setProperty('--brand-primary', theme.primary_color)
  root.style.setProperty('--brand-secondary', theme.secondary_color)
  root.style.setProperty('--brand-accent', theme.accent_color)
  root.style.setProperty('--brand-bg', theme.bg_color)
  root.style.setProperty('--brand-surface', theme.surface_color)
  root.style.setProperty('--brand-text', theme.text_color)

  if (shop.name) document.title = `${shop.name} | Agenda`

  const favicon = normalizeUrl(shop.favicon_url || shop.logo_url)
  if (favicon) {
    let link = document.querySelector('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = favicon
  }
}

export function normalizeUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('data:image/')) return text
  return `https://${text}`
}

export function instagramUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  const handle = raw.replace('@', '').replace(/^instagram\.com\//, '').replace(/\/$/, '')
  return `https://instagram.com/${handle}`
}

export function whatsappLink(phone, text = '') {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  const normalized = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${normalized}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function publicBookingLink(slug) {
  const clean = slug || import.meta.env.VITE_DEFAULT_SHOP_SLUG || 'barbearia-demo'
  return `${window.location.origin}/agendar/${clean}`
}

export function internalPanelLink(slug) {
  const clean = slug || import.meta.env.VITE_DEFAULT_SHOP_SLUG || 'barbearia-demo'
  return `${window.location.origin}/app/${clean}`
}

export function qrCodeUrl(text, size = 320) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`
}
