/**
 * Три оси важности вместо одного балла (H6): срочность / ставки / действие-на-мне.
 * Модель проверена на реальной выборке — по каждой оси наверх всплывает разное.
 *
 * Срочность опирается на извлечённый LLM срок (due_at); если его нет — на слова-
 * маркеры и свежесть. Ставки — на суммы денег и «тяжёлые» слова + базовую важность.
 * Действие — на suggested_action и повелительные глаголы. Это эвристики поверх того,
 * что уже есть в Item; со временем часть уедет на сервер (due_at уже уехал).
 */
import type { Item } from '../types/api'
import { dueUrgency } from './datetime'

export type Axis = 'importance' | 'urgency' | 'stakes' | 'action'

export const AXIS_META: Record<Axis, { label: string; color: string }> = {
  importance: { label: 'Важность', color: '#3d86e0' },
  urgency: { label: 'Срок', color: '#f2603f' },
  stakes: { label: 'Ставки', color: '#7b6cf2' },
  action: { label: 'Действие', color: '#3fbf8f' },
}

function text(i: Item): string {
  return [i.title, i.summary, i.suggested_action].filter(Boolean).join(' ').toLowerCase()
}

const MONTHS = 'янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек'

/** Срочность 0–100: прежде всего срок (due_at), плюс слова-маркеры и свежесть. */
export function urgency(i: Item, now: Date = new Date()): number {
  if (i.due_at) return dueUrgency(i.due_at, now)
  const t = text(i)
  let s = 0
  if (/\b(срочно|немедленн|критичн|asap|critical)\b/.test(t)) s += 55
  if (/\b(сегодня|завтра|сейчас)\b/.test(t)) s += 35
  if (new RegExp(`\\bдо\\s+\\d{1,2}\\s*(${MONTHS})`).test(t)) s += 30
  if (/\b\d{1,2}:\d{2}\b/.test(t)) s += 15
  if (/\bчерез\s+\d+\s*(мин|час|ч)\b/.test(t)) s += 25
  const days = (now.getTime() - new Date(i.created_at).getTime()) / 86_400_000
  s += days < 0.5 ? 25 : days < 1 ? 12 : days < 3 ? 4 : 0
  return Math.min(100, s)
}

/** Ставки 0–100: суммы денег и «тяжёлые» слова + половина базовой важности. */
export function stakes(i: Item): number {
  const t = text(i)
  let s = Math.round(i.importance * 0.5)
  const amounts = [...t.matchAll(/(\d[\d\s ]{3,})\s*(?:₽|руб|р\b|rub|\$|€)/g)]
  const amt = amounts.reduce((m, x) => Math.max(m, parseInt(x[1].replace(/\D/g, '') || '0', 10)), 0)
  if (amt >= 100_000) s += 45
  else if (amt >= 10_000) s += 30
  else if (amt >= 1_000) s += 18
  if (/\b(утечк|компромет|взлом|пароль|секрет|безопасн|breach|штраф|задолжен|долг|просроч|блокир|уволь|суд)\b/.test(t)) s += 30
  return Math.min(100, s)
}

/** Действие-на-мне 0–100: suggested_action + повелительные глаголы + «ждёт вас». */
export function action(i: Item): number {
  const t = text(i)
  let s = 0
  if (i.suggested_action) s += 45
  if (/\b(проверь|проверить|оплат|перезвон|подтверд|ответь|ответить|подпиш|подписать|продли|отозв|дополни|допиши|заполни|отправь|согласуй|перенеси)\b/.test(t)) s += 40
  if (/\b(вам|тебе|ваш|подпис|апрув|review|ревью|ждёт|требует)\b/.test(t)) s += 15
  return Math.min(100, s)
}

/** Балл по выбранной оси (importance берётся как есть). */
export function axisScore(i: Item, axis: Axis, now: Date = new Date()): number {
  switch (axis) {
    case 'urgency': return urgency(i, now)
    case 'stakes': return stakes(i)
    case 'action': return action(i)
    default: return i.importance
  }
}
