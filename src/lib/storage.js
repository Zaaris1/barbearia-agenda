const SESSION_KEY = 'barbearia_agenda_session_v1'
const MASTER_SESSION_KEY = 'barbearia_agenda_master_session_v1'

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export function saveMasterSession(session) {
  localStorage.setItem(MASTER_SESSION_KEY, JSON.stringify(session))
}

export function readMasterSession() {
  try {
    return JSON.parse(localStorage.getItem(MASTER_SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

export function clearMasterSession() {
  localStorage.removeItem(MASTER_SESSION_KEY)
}
