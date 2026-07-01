/**
 * Гард: если base URL/токен не настроены — уводит на /settings.
 * Также подписывается на 401 от API-клиента и делает то же самое.
 */

import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { onUnauthorized } from '../../api/client'
import { useSettings } from '../../hooks/useSettings'

export function RequireSettings({ children }: { children: React.ReactNode }) {
  const { configured } = useSettings()
  const navigate = useNavigate()

  useEffect(() => onUnauthorized(() => navigate('/settings')), [navigate])

  if (!configured) {
    return <Navigate to="/settings" replace />
  }

  return <>{children}</>
}
