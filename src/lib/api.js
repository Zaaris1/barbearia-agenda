import { supabase } from './supabase'

function unwrapRpc(result, fallback = null) {
  if (result.error) {
    throw new Error(result.error.message || 'Erro ao consultar o Supabase.')
  }

  if (result.data === null || result.data === undefined) {
    return fallback
  }

  return result.data
}

export async function loginWithPin(shopSlug, pin) {
  const res = await supabase.rpc('login_with_pin', {
    p_shop_slug: shopSlug,
    p_pin: pin,
  })

  const data = unwrapRpc(res)

  if (Array.isArray(data)) {
    return data[0] ?? null
  }

  return data
}

export async function logoutSession(sessionToken) {
  const res = await supabase.rpc('logout_session', {
    p_session_token: sessionToken,
  })

  return unwrapRpc(res, { ok: true })
}

export async function getBootstrap(sessionToken) {
  const res = await supabase.rpc('internal_get_bootstrap', {
    p_session_token: sessionToken,
  })

  return unwrapRpc(res, {})
}

export async function getDashboard(sessionToken, dateISO) {
  const res = await supabase.rpc('internal_get_dashboard', {
    p_session_token: sessionToken,
    p_date: dateISO,
  })

  return unwrapRpc(res, {})
}

export async function listAppointments(sessionToken, filters = {}) {
  const res = await supabase.rpc('internal_list_appointments', {
    p_session_token: sessionToken,
    p_date: filters.date || null,
    p_barber_id: filters.barberId || null,
    p_status: filters.status || null,
  })

  const data = unwrapRpc(res, [])

  return Array.isArray(data) ? data : []
}

export async function createAppointment(sessionToken, payload) {
  const res = await supabase.rpc('internal_create_appointment', {
    p_session_token: sessionToken,
    p_client_id: payload.clientId || null,
    p_client_name: payload.clientName,
    p_client_phone: payload.clientPhone,
    p_barber_id: payload.barberId,
    p_service_id: payload.serviceId,
    p_date: payload.date,
    p_start_time: payload.startTime,
    p_notes: payload.notes || '',
    p_status: payload.status || 'AGENDADO',
  })

  return unwrapRpc(res)
}

export async function updateAppointmentStatus(sessionToken, appointmentId, status, note = '') {
  const res = await supabase.rpc('internal_update_appointment_status', {
    p_session_token: sessionToken,
    p_appointment_id: appointmentId,
    p_status: status,
    p_note: note,
  })

  return unwrapRpc(res)
}

export async function rescheduleAppointment(sessionToken, appointmentId, date, startTime) {
  const res = await supabase.rpc('internal_reschedule_appointment', {
    p_session_token: sessionToken,
    p_appointment_id: appointmentId,
    p_date: date,
    p_start_time: startTime,
  })

  return unwrapRpc(res)
}

export async function listClients(sessionToken, search = '') {
  const res = await supabase.rpc('internal_list_clients', {
    p_session_token: sessionToken,
    p_search: search || '',
  })

  const data = unwrapRpc(res, [])

  return Array.isArray(data) ? data : []
}

export async function saveClient(sessionToken, payload) {
  const res = await supabase.rpc('internal_save_client', {
    p_session_token: sessionToken,
    p_client_id: payload.id || null,
    p_name: payload.name,
    p_phone: payload.phone,
    p_notes: payload.notes || '',
  })

  return unwrapRpc(res)
}

export async function saveService(sessionToken, payload) {
  const res = await supabase.rpc('internal_save_service', {
    p_session_token: sessionToken,
    p_service_id: payload.id || null,
    p_name: payload.name,
    p_duration_min: Number(payload.durationMin || 30),
    p_price: Number(payload.price || 0),
    p_active: payload.active !== false,
  })

  return unwrapRpc(res)
}

export async function saveBarber(sessionToken, payload) {
  const res = await supabase.rpc('internal_save_barber', {
    p_session_token: sessionToken,
    p_barber_id: payload.id || null,
    p_name: payload.name,
    p_phone: payload.phone || '',
    p_active: payload.active !== false,
    p_role: payload.role || 'BARBER',
    p_pin: payload.pin || '',
    p_start_time: payload.startTime || '08:00',
    p_end_time: payload.endTime || '19:00',
    p_days_working: payload.daysWorking || ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'],
    p_service_ids: payload.serviceIds || null,
    p_color: payload.color || '#d4a857',
  })

  return unwrapRpc(res)
}

export async function updateBarbershopSettings(sessionToken, payload) {
  const res = await supabase.rpc('internal_update_barbershop_settings', {
    p_session_token: sessionToken,
    p_name: payload.name,
    p_slug: payload.slug,
    p_phone: payload.phone || '',
    p_address: payload.address || '',
    p_default_slot_minutes: Number(payload.defaultSlotMinutes || 30),
    p_public_booking_enabled: payload.publicBookingEnabled !== false,
  })

  return unwrapRpc(res)
}

export async function publicGetShop(slug) {
  const res = await supabase.rpc('public_get_shop', {
    p_shop_slug: slug,
  })

  return unwrapRpc(res, {})
}

export async function publicGetAvailableSlots(slug, serviceId, barberId, dateISO) {
  const res = await supabase.rpc('public_get_available_slots', {
    p_shop_slug: slug,
    p_service_id: serviceId,
    p_barber_id: barberId,
    p_date: dateISO,
  })

  const data = unwrapRpc(res, [])

  return Array.isArray(data) ? data : []
}

export async function publicCreateAppointment(slug, payload) {
  const res = await supabase.rpc('public_create_appointment', {
    p_shop_slug: slug,
    p_service_id: payload.serviceId,
    p_barber_id: payload.barberId,
    p_date: payload.date,
    p_start_time: payload.startTime,
    p_client_name: payload.clientName,
    p_client_phone: payload.clientPhone,
    p_notes: payload.notes || '',
  })

  return unwrapRpc(res)
}
