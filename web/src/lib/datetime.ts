/**
 * Форматирование дат/времени для карточек. Раньше нигде не показывались время
 * и дата — было непонятно, что свежее. Даём и относительное («2 мин»), и точное
 * («3 июл 14:07»), чтобы сразу понимать актуальность.
 */

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

/** Относительное время: «только что», «14 мин», «3 ч», «2 дн», иначе дата. */
export function formatAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const then = new Date(iso)
  const sec = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000))
  if (sec < 45) return 'только что'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} мин`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} ч`
  const day = Math.round(hr / 24)
  if (day <= 7) return `${day} дн`
  return formatAbsShort(iso, now)
}

/** Короткая абсолютная дата: «3 июл» (без времени; год — если не текущий). */
export function formatAbsShort(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** Полная метка: «сегодня 14:07», «вчера 9:12» или «3 июл 14:07». */
export function formatAbs(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  const time = `${d.getHours()}:${pad(d.getMinutes())}`
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return `сегодня ${time}`
  const yest = new Date(now)
  yest.setDate(now.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return `вчера ${time}`
  return `${formatAbsShort(iso, now)} ${time}`
}

/**
 * Метка срока (due_at) для чипа: «просрочено», «сегодня 18:00», «завтра», «через
 * 3 дн», «до 20 июл». Прошедшее — «просрочено N дн».
 */
export function formatDue(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  const ms = d.getTime() - now.getTime()
  const day = Math.round(ms / 86_400_000)
  const time = `${d.getHours()}:${pad(d.getMinutes())}`
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0
  if (ms < 0) {
    const overdue = Math.max(1, Math.abs(day))
    return day === 0 ? 'просрочено' : `просрочено ${overdue} дн`
  }
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return hasTime ? `сегодня ${time}` : 'сегодня'
  const tom = new Date(now)
  tom.setDate(now.getDate() + 1)
  if (d.toDateString() === tom.toDateString()) return hasTime ? `завтра ${time}` : 'завтра'
  if (day <= 7) return `через ${day} дн`
  return `до ${formatAbsShort(iso, now)}`
}

/**
 * Насколько срок «горит» прямо сейчас, 0–100 (для оси срочности и цвета чипа).
 * Просрочено = 100, сегодня ≈ 90, спадает к нулю за ~14 дней.
 */
export function dueUrgency(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return 0
  const days = (new Date(iso).getTime() - now.getTime()) / 86_400_000
  if (days <= 0) return 100
  if (days < 1) return 90
  if (days < 2) return 78
  if (days < 4) return 60
  if (days < 7) return 42
  if (days < 14) return 24
  return 10
}
