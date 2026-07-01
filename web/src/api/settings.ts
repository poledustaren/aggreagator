/**
 * Хранилище настроек подключения (base URL сервера + Bearer-токен устройства)
 * в localStorage. Дашборд self-host, поэтому URL и токен пользователь
 * вводит сам на экране настроек.
 */

const STORAGE_KEY = 'aggregat.settings.v1'

export interface ConnectionSettings {
  baseUrl: string
  token: string
}

// Базовый адрес API по умолчанию — same-origin /v1: дашборд раздаётся с того же
// хоста (agg.dustar.pro), что и API, поэтому адрес вводить не нужно. Оставлен как
// функция, чтобы работать на любом домене без пересборки.
export function defaultBaseUrl(): string {
  return `${window.location.origin}/v1`
}

function defaults(): ConnectionSettings {
  return { baseUrl: defaultBaseUrl(), token: '' }
}

export function loadSettings(): ConnectionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults()
    const parsed = JSON.parse(raw) as Partial<ConnectionSettings>
    return {
      // Пустой/отсутствующий адрес → same-origin /v1 (не заставляем вводить вручную).
      baseUrl: parsed.baseUrl?.trim() ? parsed.baseUrl : defaultBaseUrl(),
      token: parsed.token ?? '',
    }
  } catch {
    return defaults()
  }
}

/**
 * Автонастройка из URL при заходе с телефона: приложение открывает
 * `https://agg.dustar.pro/#token=<device-token>`. Токен лежит во фрагменте (#),
 * поэтому НЕ уходит на сервер и не попадает в логи. Здесь мы его вынимаем,
 * сохраняем вместе с same-origin адресом и чистим URL, чтобы токен не «светился».
 * Возвращает true, если токен применён.
 */
export function applyBootstrapFromUrl(): boolean {
  try {
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const fromQuery = new URLSearchParams(window.location.search)
    const token = fromHash.get('token') ?? fromQuery.get('token')
    if (!token) return false

    const base = fromHash.get('base') ?? fromQuery.get('base') ?? defaultBaseUrl()
    const next: ConnectionSettings = { baseUrl: base, token }
    saveSettings(next)
    notifySettingsChanged(next)

    // Убираем токен из адресной строки (оставляем чистый путь).
    window.history.replaceState(null, '', window.location.pathname)
    return true
  } catch {
    return false
  }
}

export function saveSettings(settings: ConnectionSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function clearSettings(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function isConfigured(settings: ConnectionSettings): boolean {
  return settings.baseUrl.trim().length > 0 && settings.token.trim().length > 0
}

// Простой pub/sub, чтобы клиент API и UI могли реагировать на изменение настроек
// без глобального стейт-менеджера.
type Listener = (settings: ConnectionSettings) => void
const listeners = new Set<Listener>()

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifySettingsChanged(settings: ConnectionSettings): void {
  listeners.forEach((l) => l(settings))
}
