import { supabase } from './supabase'

const ACCEPTED_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
}

function normalizeSlug(value) {
  return String(value || 'barbearia')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'barbearia'
}

function extensionFromFile(file) {
  const fromMime = ACCEPTED_EXTENSIONS[file?.type]
  if (fromMime) return fromMime

  const name = String(file?.name || '')
  const ext = name.split('.').pop()?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'ico'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext
  }

  return 'png'
}

function validateImageFile(file) {
  if (!file) throw new Error('Selecione uma imagem.')

  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/x-icon']
  if (file.type && !allowed.includes(file.type)) {
    throw new Error('Formato inválido. Use PNG, JPG, WEBP, SVG ou ICO.')
  }

  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    throw new Error('Imagem muito grande. Use arquivos de até 5 MB.')
  }
}

export async function uploadBrandingImage(shopSlug, kind, file) {
  validateImageFile(file)

  const cleanSlug = normalizeSlug(shopSlug)
  const cleanKind = normalizeSlug(kind || 'imagem')
  const ext = extensionFromFile(file)
  const stamp = Date.now()
  const path = `${cleanSlug}/${cleanKind}-${stamp}.${ext}`

  const { error } = await supabase.storage
    .from('branding')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || undefined,
    })

  if (error) {
    throw new Error(error.message || 'Não foi possível enviar a imagem.')
  }

  const { data } = supabase.storage.from('branding').getPublicUrl(path)

  if (!data?.publicUrl) {
    throw new Error('Imagem enviada, mas não foi possível gerar a URL pública.')
  }

  return data.publicUrl
}
