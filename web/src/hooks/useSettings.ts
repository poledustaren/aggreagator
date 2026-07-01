/**
 * Реактивный доступ к настройкам подключения (localStorage) + проверка связи с сервером.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  type ConnectionSettings,
  isConfigured,
  loadSettings,
  notifySettingsChanged,
  saveSettings,
  subscribeSettings,
} from '../api/settings'
import { fetchTags } from '../api/client'

export function useSettings() {
  const [settings, setSettings] = useState<ConnectionSettings>(() => loadSettings())

  useEffect(() => subscribeSettings(setSettings), [])

  const update = useCallback((next: ConnectionSettings) => {
    saveSettings(next)
    notifySettingsChanged(next)
  }, [])

  return { settings, update, configured: isConfigured(settings) }
}

export type ConnectionStatus = 'idle' | 'checking' | 'ok' | 'error'

/**
 * Простой пинг сервера через GET /v1/tags — используется как индикатор связи
 * на экране настроек.
 */
export function useConnectionCheck() {
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    setStatus('checking')
    setError(null)
    try {
      await fetchTags()
      setStatus('ok')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    }
  }, [])

  return { status, error, check }
}
