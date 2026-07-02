/**
 * Пикер временного окна: пресеты (сегодня/7 дней/30 дней) + произвольные
 * from/to через datetime-local. Управляемый компонент — состояние окна
 * живёт у вызывающей страницы. Используется на /relations и /timeline.
 */

import { useState } from 'react'

export interface TimeWindow {
  from: string // ISO
  to: string // ISO
}

type Preset = 'today' | '7d' | '30d' | 'custom'

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function windowForPreset(preset: Exclude<Preset, 'custom'>): TimeWindow {
  const now = new Date()
  if (preset === 'today') {
    return { from: startOfToday().toISOString(), to: now.toISOString() }
  }
  const days = preset === '7d' ? 7 : 30
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return { from: from.toISOString(), to: now.toISOString() }
}

// Дефолт — последние 7 дней (используется и «Связями», и «Таймлайном»).
export function defaultWindow(): TimeWindow {
  return windowForPreset('7d')
}

// Формат для <input type="datetime-local"> — без секунд/таймзоны.
function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const PRESET_OPTIONS: { value: Exclude<Preset, 'custom'>; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
]

interface WindowPickerProps {
  value: TimeWindow
  onChange: (next: TimeWindow) => void
}

export function WindowPicker({ value, onChange }: WindowPickerProps) {
  const [activePreset, setActivePreset] = useState<Preset>('7d')

  const applyPreset = (preset: Exclude<Preset, 'custom'>) => {
    setActivePreset(preset)
    onChange(windowForPreset(preset))
  }

  const applyCustom = (field: 'from' | 'to', localValue: string) => {
    setActivePreset('custom')
    if (!localValue) return
    const iso = new Date(localValue).toISOString()
    onChange({ ...value, [field]: iso })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex items-center gap-1.5">
        {PRESET_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => applyPreset(opt.value)}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              activePreset === opt.value
                ? 'border-neutral-600 bg-neutral-800 text-neutral-100'
                : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
        <label className="flex items-center gap-1.5">
          от
          <input
            type="datetime-local"
            value={toLocalInputValue(value.from)}
            onChange={(e) => applyCustom('from', e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-200"
          />
        </label>
        <label className="flex items-center gap-1.5">
          до
          <input
            type="datetime-local"
            value={toLocalInputValue(value.to)}
            onChange={(e) => applyCustom('to', e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-200"
          />
        </label>
      </div>
    </div>
  )
}
