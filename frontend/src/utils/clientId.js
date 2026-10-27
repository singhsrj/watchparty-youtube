const STORAGE_KEY = 'watchparty:clientId'

let memoryId = null

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Stable per-tab identity. The socket id changes on every refresh, so the server
// uses this id to recognise a returning user and restore their role (e.g. host).
// sessionStorage survives refreshes but is not shared between tabs, so two tabs of
// the same browser still count as two different people.
export const getClientId = () => {
  try {
    let id = sessionStorage.getItem(STORAGE_KEY)
    if (!id) {
      id = generateId()
      sessionStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    if (!memoryId) memoryId = generateId()
    return memoryId
  }
}
