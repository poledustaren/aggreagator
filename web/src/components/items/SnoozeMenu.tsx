/**
 * Выпадающее меню выбора времени отложения (snooze) Item.
 */

interface SnoozeMenuProps {
  onPick: (isoUntil: string) => void
  onClose: () => void
}

function inHours(hours: number): string {
  const d = new Date()
  d.setHours(d.getHours() + hours)
  return d.toISOString()
}

function tomorrowMorning(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function nextWeek(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

const OPTIONS: { label: string; getValue: () => string }[] = [
  { label: 'Через 1 час', getValue: () => inHours(1) },
  { label: 'Через 3 часа', getValue: () => inHours(3) },
  { label: 'Завтра утром', getValue: tomorrowMorning },
  { label: 'Через неделю', getValue: nextWeek },
]

export function SnoozeMenu({ onPick, onClose }: SnoozeMenuProps) {
  return (
    <>
      {/* Клик вне меню закрывает его */}
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-neutral-700 bg-neutral-800 shadow-lg">
        {OPTIONS.map((opt) => (
          <button
            key={opt.label}
            onClick={() => onPick(opt.getValue())}
            className="block w-full px-3 py-2 text-left text-xs text-neutral-200 hover:bg-neutral-700 first:rounded-t-md last:rounded-b-md"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </>
  )
}
