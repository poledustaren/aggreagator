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
