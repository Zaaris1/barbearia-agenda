const KEY = 'barbearia_agenda_session_v1'

export function saveSession(session) {
  localStorage.setItem(KEY, JSON.stringify(session))
}

export function readSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(KEY)
}
