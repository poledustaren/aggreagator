/**
 * Экран настроек: base URL сервера + Bearer-токен, индикатор соединения.
 */

import { useState } from 'react'
import { useSettings, useConnectionCheck } from '../hooks/useSettings'

export function SettingsPage() {
  const { settings, update } = useSettings()
  const { status, error, check } = useConnectionCheck()
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [token, setToken] = useState(settings.token)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    update({ baseUrl: baseUrl.trim(), token: token.trim() })
  }

  const handleSaveAndCheck = async (e: React.FormEvent) => {
    e.preventDefault()
    update({ baseUrl: baseUrl.trim(), token: token.trim() })
    // Даём стору применить настройки перед проверкой соединения
    setTimeout(() => check(), 0)
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <h2 className="text-lg font-medium text-neutral-100">Настройки подключения</h2>
      <p className="text-sm text-neutral-500">
        Дашборд работает поверх self-host сервера Aggregat. Укажите базовый URL API
        (например, https://api.aggregat.local/v1) и Bearer-токен устройства,
        полученный при регистрации в Android-приложении.
      </p>

      <form onSubmit={handleSave} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm text-neutral-400">Base URL сервера</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.aggregat.local/v1"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-neutral-400">Bearer-токен устройства</span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            placeholder="opaque device token"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={handleSaveAndCheck}
            className="rounded-md bg-emerald-600/20 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-600/30"
          >
            Сохранить и проверить связь
          </button>
        </div>
      </form>

      <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm">
        <span className="text-neutral-400">Статус соединения: </span>
        {status === 'idle' && <span className="text-neutral-500">не проверено</span>}
        {status === 'checking' && <span className="text-yellow-400">проверка...</span>}
        {status === 'ok' && <span className="text-emerald-400">соединение установлено</span>}
        {status === 'error' && <span className="text-red-400">ошибка: {error}</span>}
      </div>
    </div>
  )
}
