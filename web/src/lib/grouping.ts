/**
 * Группировки главной: по актуальности / по срокам / по процессам.
 * Возвращают единый вид Group[] — секции с цветом-погодой и элементами внутри.
 * Актуальность = смесь важности и срочности (дедлайн/свежесть); сроки — корзины
 * по due_at; процессы — по процессу-истории (важность H7 берётся из карты процессов).
 */
import type { Item, Process } from '../types/api'
import { urgency } from './axes'
import { weather } from './weather'

export interface Group {
  key: string
  label: string
  color: string
  hint?: string
  items: Item[]
}

/** Балл актуальности 0–100: важность пополам со срочностью (дедлайн/свежесть/слова). */
export function actualityScore(item: Item, now: Date = new Date()): number {
  return Math.round(0.55 * item.importance + 0.45 * urgency(item, now))
}

const ACTUALITY_TIERS: { min: number; label: string; color: string; hint: string }[] = [
  { min: 70, label: 'Разобрать сейчас', color: '#f2603f', hint: 'важное и горящее' },
  { min: 45, label: 'На этой неделе', color: '#7b6cf2', hint: 'заметное, скоро' },
  { min: 22, label: 'Может подождать', color: '#3d86e0', hint: 'на радаре' },
  { min: 0, label: 'Фон', color: '#6f97a3', hint: 'спокойное' },
]

export function groupByActuality(items: Item[], now: Date = new Date()): Group[] {
  const buckets = ACTUALITY_TIERS.map((t) => ({ ...t, items: [] as Item[] }))
  for (const it of items) {
    const a = actualityScore(it, now)
    const b = buckets.find((x) => a >= x.min)!
    b.items.push(it)
  }
  for (const b of buckets) b.items.sort((x, y) => actualityScore(y, now) - actualityScore(x, now))
  return buckets
    .filter((b) => b.items.length)
    .map((b, i) => ({ key: `act${i}`, label: b.label, color: b.color, hint: b.hint, items: b.items }))
}

export function groupByDeadline(items: Item[], now: Date = new Date()): Group[] {
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0)
  const endToday = new Date(startToday); endToday.setDate(endToday.getDate() + 1)
  const endWeek = new Date(startToday); endWeek.setDate(endWeek.getDate() + 7)

  const overdue: Item[] = [], today: Item[] = [], week: Item[] = [], later: Item[] = [], none: Item[] = []
  for (const it of items) {
    if (!it.due_at) { none.push(it); continue }
    const d = new Date(it.due_at).getTime()
    if (d < now.getTime()) overdue.push(it)
    else if (d < endToday.getTime()) today.push(it)
    else if (d < endWeek.getTime()) week.push(it)
    else later.push(it)
  }
  const byDue = (a: Item, b: Item) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()
  overdue.sort(byDue); today.sort(byDue); week.sort(byDue); later.sort(byDue)
  none.sort((a, b) => b.importance - a.importance)

  const defs: [string, string, string, Item[]][] = [
    ['overdue', 'Просрочено', '#f2603f', overdue],
    ['today', 'Сегодня', '#e0703f', today],
    ['week', 'Эта неделя', '#3d86e0', week],
    ['later', 'Позже', '#24b3c9', later],
    ['none', 'Без срока', '#6f97a3', none],
  ]
  return defs.filter(([, , , its]) => its.length).map(([key, label, color, its]) => ({ key, label, color, items: its }))
}

export function groupByProcess(items: Item[], processes: Process[]): Group[] {
  const pmap = new Map(processes.map((p) => [p.id, p]))
  const byProc = new Map<string, Item[]>()
  const NONE = '∅'
  for (const it of items) {
    const k = it.process_id ?? NONE
    ;(byProc.get(k) ?? byProc.set(k, []).get(k)!).push(it)
  }
  const groups: Group[] = []
  for (const [k, its] of byProc) {
    const p = k === NONE ? undefined : pmap.get(k)
    const imp = p?.importance ?? Math.max(...its.map((i) => i.importance), 0)
    its.sort((a, b) => b.importance - a.importance)
    groups.push({
      key: k,
      label: p?.title ?? (k === NONE ? 'Вне процессов' : 'Процесс'),
      color: weather(imp).color,
      hint: `${weather(imp).label} · ${its.length}`,
      items: its,
    })
  }
  // Сначала процессы повесомее (по H7), «вне процессов» — в конец.
  return groups.sort((a, b) => {
    if (a.key === NONE) return 1
    if (b.key === NONE) return -1
    const pa = pmap.get(a.key)?.importance ?? 0, pb = pmap.get(b.key)?.importance ?? 0
    return pb - pa
  })
}
