/**
 * Бейдж статуса процесса: open (идёт) — зелёный, frozen (заморожен) — серый
 * приглушённый, closed (завершён) — синий.
 */

import type { ProcessStatus } from '../../types/api'

const LABELS: Record<ProcessStatus, string> = {
  open: 'Идёт',
  frozen: 'Заморожен',
  closed: 'Завершён',
}

const STYLES: Record<ProcessStatus, string> = {
  open: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  frozen: 'bg-neutral-700/40 text-neutral-400 border-neutral-600/40',
  closed: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
}

export function ProcessStatusBadge({ status }: { status: ProcessStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  )
}
