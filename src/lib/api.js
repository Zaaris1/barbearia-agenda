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

export async function markAppointmentPaid(sessionToken, appointmentId, note = '') {
  const res = await supabase.rpc('internal_mark_appointment_paid', {
    p_session_token: sessionToken,
    p_appointment_id: appointmentId,
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
    p_commission_enabled: payload.commissionEnabled === true,
    p_commission_type: payload.commissionType || 'PERCENT',
    p_commission_value: Number(payload.commissionValue || 0),
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

export async function updateBarbershopBranding(sessionToken, payload) {
  const res = await supabase.rpc('internal_update_barbershop_branding', {
    p_session_token: sessionToken,
    p_logo_url: payload.logoUrl || '',
    p_cover_url: payload.coverUrl || '',
    p_favicon_url: payload.faviconUrl || '',
    p_slogan: payload.slogan || '',
    p_instagram: payload.instagram || '',
    p_opening_hours_text: payload.openingHoursText || '',
    p_preset_theme: payload.presetTheme || 'classic_gold',
    p_primary_color: payload.primaryColor || '#D4A857',
    p_secondary_color: payload.secondaryColor || '#0B0B0C',
    p_accent_color: payload.accentColor || '#F5C66A',
    p_bg_color: payload.bgColor || '#09090B',
    p_surface_color: payload.surfaceColor || '#151518',
    p_text_color: payload.textColor || '#F5F5F5',
  })

  return unwrapRpc(res)
}

export async function updateBarbershopPayment(sessionToken, payload) {
  const res = await supabase.rpc('internal_update_barbershop_payment', {
    p_session_token: sessionToken,
    p_payment_enabled: payload.paymentEnabled === true,
    p_payment_mode: payload.paymentMode || 'DISABLED',
    p_pix_key: payload.pixKey || '',
    p_pix_key_type: payload.pixKeyType || 'EVP',
    p_pix_receiver_name: payload.pixReceiverName || '',
    p_pix_receiver_city: payload.pixReceiverCity || '',
    p_deposit_type: payload.depositType || 'PERCENT',
    p_deposit_value: Number(payload.depositValue || 0),
    p_payment_instructions: payload.paymentInstructions || '',
  })

  return unwrapRpc(res)
}

export async function publicGetBranding(slug) {
  const res = await supabase.rpc('public_get_branding', {
    p_shop_slug: slug,
  })

  return unwrapRpc(res, {})
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

export async function listScheduleBlocks(sessionToken, filters = {}) {
  const res = await supabase.rpc('internal_list_schedule_blocks', {
    p_session_token: sessionToken,
    p_date: filters.date || null,
    p_barber_id: filters.barberId || null,
  })

  const data = unwrapRpc(res, [])

  return Array.isArray(data) ? data : []
}

export async function saveScheduleBlock(sessionToken, payload) {
  const res = await supabase.rpc('internal_save_schedule_block', {
    p_session_token: sessionToken,
    p_block_id: payload.id || null,
    p_barber_id: payload.barberId || null,
    p_date: payload.date,
    p_start_time: payload.startTime || '00:00',
    p_end_time: payload.endTime || '23:59',
    p_block_type: payload.blockType || 'BLOQUEIO',
    p_reason: payload.reason || '',
    p_all_day: payload.allDay === true,
  })

  return unwrapRpc(res)
}

export async function deleteScheduleBlock(sessionToken, blockId) {
  const res = await supabase.rpc('internal_delete_schedule_block', {
    p_session_token: sessionToken,
    p_block_id: blockId,
  })

  return unwrapRpc(res, { ok: true })
}

export async function updateBarbershopMessages(sessionToken, payload) {
  const res = await supabase.rpc('internal_update_barbershop_messages', {
    p_session_token: sessionToken,
    p_confirmation_template: payload.confirmationTemplate || '',
    p_reminder_template: payload.reminderTemplate || '',
    p_cancellation_template: payload.cancellationTemplate || '',
  })

  return unwrapRpc(res)
}

export async function listAccessUsers(sessionToken) {
  const res = await supabase.rpc('internal_list_app_users', {
    p_session_token: sessionToken,
  })

  const data = unwrapRpc(res, [])

  return Array.isArray(data) ? data : []
}

export async function saveAccessUser(sessionToken, payload) {
  const res = await supabase.rpc('internal_save_app_user', {
    p_session_token: sessionToken,
    p_user_id: payload.id || null,
    p_name: payload.name,
    p_phone: payload.phone || '',
    p_role: payload.role || 'BARBER',
    p_active: payload.active !== false,
    p_pin: payload.pin || '',
  })

  return unwrapRpc(res)
}

export async function changeOwnPin(sessionToken, currentPin, newPin) {
  const res = await supabase.rpc('internal_change_own_pin', {
    p_session_token: sessionToken,
    p_current_pin: currentPin,
    p_new_pin: newPin,
  })

  return unwrapRpc(res, { ok: true })
}

export async function publicFindClientAppointments(slug, phone) {
  const res = await supabase.rpc('public_find_client_appointments', {
    p_shop_slug: slug,
    p_client_phone: phone,
  })

  return unwrapRpc(res, { shop: null, appointments: [] })
}

export async function publicCancelClientAppointment(slug, appointmentId, phone, reason = '') {
  const res = await supabase.rpc('public_cancel_client_appointment', {
    p_shop_slug: slug,
    p_appointment_id: appointmentId,
    p_client_phone: phone,
    p_reason: reason || 'Cancelado pelo cliente',
  })

  return unwrapRpc(res)
}


export async function getFinancialReport(sessionToken, month) {
  const res = await supabase.rpc('internal_get_financial_report', {
    p_session_token: sessionToken,
    p_month: month || '',
  })

  return unwrapRpc(res, {})
}

export async function masterLoginWithPin(pin) {
  const res = await supabase.rpc('master_login_with_pin', {
    p_pin: pin,
  })

  return unwrapRpc(res)
}

export async function masterLogout(masterSessionToken) {
  const res = await supabase.rpc('master_logout', {
    p_session_token: masterSessionToken,
  })

  return unwrapRpc(res, { ok: true })
}

export async function masterListBarbershops(masterSessionToken) {
  const res = await supabase.rpc('master_list_barbershops', {
    p_session_token: masterSessionToken,
  })

  const data = unwrapRpc(res, [])

  return Array.isArray(data) ? data : []
}


export async function masterGetSubscriptionReport(masterSessionToken, month) {
  const res = await supabase.rpc('master_get_subscription_report', {
    p_session_token: masterSessionToken,
    p_month: month || '',
  })

  return unwrapRpc(res, {})
}

export async function masterCreateBarbershop(masterSessionToken, payload) {
  const res = await supabase.rpc('master_create_barbershop', {
    p_session_token: masterSessionToken,
    p_name: payload.name,
    p_slug: payload.slug,
    p_phone: payload.phone || '',
    p_address: payload.address || '',
    p_monthly_fee: Number(payload.monthlyFee || 0),
    p_subscription_due_date: payload.subscriptionDueDate || null,
    p_admin_name: payload.adminName || 'Administrador',
    p_admin_pin: payload.adminPin || '',
  })

  return unwrapRpc(res)
}

export async function masterUpdateBarbershop(masterSessionToken, payload) {
  const res = await supabase.rpc('master_update_barbershop', {
    p_session_token: masterSessionToken,
    p_barbershop_id: payload.id,
    p_name: payload.name,
    p_slug: payload.slug,
    p_phone: payload.phone || '',
    p_address: payload.address || '',
    p_active: payload.active !== false,
    p_public_booking_enabled: payload.publicBookingEnabled !== false,
    p_subscription_status: payload.subscriptionStatus || 'ATIVO',
    p_subscription_due_date: payload.subscriptionDueDate || null,
    p_subscription_grace_days: Number(payload.subscriptionGraceDays ?? 5),
    p_monthly_fee: Number(payload.monthlyFee || 0),
    p_blocked_reason: payload.blockedReason || '',
  })

  return unwrapRpc(res)
}

export async function masterRegisterPayment(masterSessionToken, payload) {
  const res = await supabase.rpc('master_register_payment', {
    p_session_token: masterSessionToken,
    p_barbershop_id: payload.barbershopId,
    p_amount: Number(payload.amount || 0),
    p_paid_at: payload.paidAt || new Date().toISOString(),
    p_next_due_date: payload.nextDueDate || null,
    p_notes: payload.notes || '',
  })

  return unwrapRpc(res)
}
