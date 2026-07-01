/**
 * Стандартные вью для состояний загрузки/ошибки/пустоты — используются на всех экранах.
 */

export function LoadingState({ label = 'Загрузка...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-neutral-400">
      <span className="animate-pulse">{label}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-red-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Повторить
        </button>
      )}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-neutral-500">
      <span>{message}</span>
    </div>
  )
}
