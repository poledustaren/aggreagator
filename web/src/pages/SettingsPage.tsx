/**
 * Экран настроек / входа: вход по паролю (основной путь для браузера) ИЛИ
 * ручной ввод base URL + Bearer-токена устройства (для отладки/переноса токена).
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettings, useConnectionCheck } from '../hooks/useSettings'
import { loginWithPassword } from '../api/client'
import { defaultBaseUrl } from '../api/settings'

export function SettingsPage() {
  const { settings, update } = useSettings()
  const { status, error, check } = useConnectionCheck()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)

  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [token, setToken] = useState(settings.token)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setLoggingIn(true)
    try {
      const t = await loginWithPassword(password.trim())
      update({ baseUrl: defaultBaseUrl(), token: t })
      navigate('/')
    } catch {
      setLoginError('Неверный пароль или сервер недоступен')
    } finally {
      setLoggingIn(false)
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    update({ baseUrl: baseUrl.trim(), token: token.trim() })
  }

  const handleSaveAndCheck = async (e: React.FormEvent) => {
    e.preventDefault()
    update({ baseUrl: baseUrl.trim(), token: token.trim() })
    setTimeout(() => check(), 0)
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <h2 className="text-lg font-medium text-neutral-100">Вход</h2>

      {/* Основной путь — вход по паролю. */}
      <form onSubmit={handleLogin} className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-sm text-neutral-400">Войдите по паролю, чтобы открыть дашборд.</p>
        <label className="block space-y-1">
          <span className="text-sm text-neutral-400">Пароль</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoFocus
            placeholder="пароль доступа"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200"
          />
        </label>
        {loginError && <p className="text-sm text-red-400">{loginError}</p>}
        <button
          type="submit"
          disabled={loggingIn || !password.trim()}
          className="w-full rounded-md bg-emerald-600/20 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50"
        >
          {loggingIn ? 'Вход…' : 'Войти'}
        </button>
      </form>

      {/* Резервный путь — ручной токен устройства. */}
      <details className="rounded-lg border border-neutral-800 bg-neutral-900/50">
        <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-400">
          Вход по токену устройства (для отладки)
        </summary>
        <div className="space-y-3 p-4 pt-0">
          <form onSubmit={handleSave} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm text-neutral-400">Base URL сервера</span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://agg.dustar.pro/v1"
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
      </details>
    </div>
  )
}
