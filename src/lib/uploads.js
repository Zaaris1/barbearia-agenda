import { supabase } from './supabase'

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

async function createUploadPath(sessionToken, kind, file) {
  if (!sessionToken) {
    throw new Error('Sessao expirada. Faca login novamente.')
  }

  const { data, error } = await supabase.rpc('internal_create_branding_upload', {
    p_session_token: sessionToken,
    p_kind: kind || 'imagem',
    p_file_name: file?.name || '',
    p_content_type: file?.type || '',
    p_file_size: file?.size || 0,
  })

  if (error) {
    throw new Error(error.message || 'Nao foi possivel preparar o envio da imagem.')
  }

  if (!data?.path) {
    throw new Error('Nao foi possivel preparar o envio da imagem.')
  }

  return data.path
}

async function markUploadUsed(sessionToken, path) {
  const { error } = await supabase.rpc('internal_mark_branding_upload_used', {
    p_session_token: sessionToken,
    p_path: path,
  })

  if (error) {
    console.warn('Nao foi possivel finalizar o token de upload.', error)
  }
}

export async function uploadBrandingImage(sessionToken, kind, file) {
  validateImageFile(file)

  const path = await createUploadPath(sessionToken, kind, file)

  const { error } = await supabase.storage
    .from('branding')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })

  if (error) {
    throw new Error(error.message || 'Não foi possível enviar a imagem.')
  }

  await markUploadUsed(sessionToken, path)

  const { data } = supabase.storage.from('branding').getPublicUrl(path)

  if (!data?.publicUrl) {
    throw new Error('Imagem enviada, mas não foi possível gerar a URL pública.')
  }

  return data.publicUrl
}
