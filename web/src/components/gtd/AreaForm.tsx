/**
 * Форма создания зоны (Area).
 */

import { useState } from 'react'
import type { AreaInput } from '../../types/api'

export function AreaForm({ onSubmit, submitting }: { onSubmit: (input: AreaInput) => void; submitting: boolean }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3b82f6')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({ name: name.trim(), color })
    setName('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название новой зоны"
        className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-8 w-10 rounded border border-neutral-700 bg-neutral-800"
        title="Цвет зоны"
      />
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="rounded-md bg-emerald-600/20 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50"
      >
        Добавить
      </button>
    </form>
  )
}
