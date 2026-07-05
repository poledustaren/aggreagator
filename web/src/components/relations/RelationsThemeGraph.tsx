/**
 * Обзор связей на уровне ТЕМ (funufunu) — вместо каши из 120 процессов показываем
 * ~десяток крупных пузырей-тем + связи тема↔тема. Одна тема — один пузырь: halo
 * цвета темы, ядро — погода по пику важности, число процессов внутри, подпись.
 * Линии между пузырями — связи вне темы (агрегированные), толщина по количеству.
 * Клик по теме раскрывает её процессы в панели справа. Мелкие/одиночные темы
 * свёрнуты в пузырь «Разрозненные», чтобы ничего не наезжало.
 */
import { useMemo, useState } from 'react'
import { hexRgba, weather } from '../../lib/weather'

export interface ThemeBubble {
  key: string
  name: string
  count: number
  maxImp: number
  isBucket: boolean
}

export interface ThemeLink {
  a: string
  b: string
  count: number
}

interface Props {
  bubbles: ThemeBubble[]
  links: ThemeLink[]
  themeColor: (theme: string | null) => string
  onSelect: (key: string) => void
  onDeselect: () => void
  highlightKey?: string | null
}

const W = 800
const H = 540

function bubbleRadius(count: number): number {
  return 16 + Math.min(28, Math.sqrt(Math.max(1, count)) * 7)
}

interface Placed extends ThemeBubble {
  x: number
  y: number
  r: number
}

/**
 * Сетка (а не спираль): при десятке пузырей и паре связей аккуратная решётка
 * читаемее и гарантированно без наездов. Крупные темы — сверху-слева, ряды
 * центрируются. Ячейка вмещает пузырь + подпись.
 */
function layout(bubbles: ThemeBubble[]): Map<string, Placed> {
  const placed = new Map<string, Placed>()
  const T = bubbles.length
  if (T === 0) return placed
  const cols = Math.max(1, Math.round(Math.sqrt((T * W) / H)))
  const rows = Math.ceil(T / cols)
  const cellW = W / cols
  const cellH = H / rows
  bubbles.forEach((b, c) => {
    const row = Math.floor(c / cols)
    const col = c % cols
    const itemsInRow = row === rows - 1 ? T - row * cols : cols
    const rowOffset = ((cols - itemsInRow) * cellW) / 2
    const x = rowOffset + (col + 0.5) * cellW
    const y = (row + 0.5) * cellH
    placed.set(b.key, { ...b, x, y, r: bubbleRadius(b.count) })
  })
  return placed
}

function shortLabel(t: string): string {
  return t.length > 18 ? t.slice(0, 17) + '…' : t
}

export function RelationsThemeGraph({ bubbles, links, themeColor, onSelect, onDeselect, highlightKey }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const placed = useMemo(() => layout(bubbles), [bubbles])

  return (
    <div
      style={{ borderRadius: 20, boxShadow: 'var(--shadow-card)', background: 'radial-gradient(130% 120% at 50% 0%, var(--surface2), var(--surface))', overflow: 'hidden', padding: 8 }}
      onClick={onDeselect}
    >
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Обзор связей по темам">
        {/* Связи тема↔тема. */}
        {links.map((l, i) => {
          const a = placed.get(l.a), b = placed.get(l.b)
          if (!a || !b) return null
          const active = highlightKey != null && (l.a === highlightKey || l.b === highlightKey)
          const dim = highlightKey != null && !active
          return (
            <line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="var(--accent2)"
              strokeWidth={1 + Math.min(6, l.count * 1.3)}
              opacity={dim ? 0.08 : active ? 0.8 : 0.32}
              strokeLinecap="round"
            >
              <title>{`${a.name} ↔ ${b.name}: ${l.count} связ.`}</title>
            </line>
          )
        })}
        {/* Пузыри-темы. */}
        {[...placed.values()].map((b) => {
          const tc = b.isBucket ? '#6f8794' : themeColor(b.key)
          const w = weather(b.maxImp)
          const sel = highlightKey === b.key
          const hov = hovered === b.key
          const dim = highlightKey != null && !sel
          const label = b.isBucket ? `Разрозненные (${b.count})` : shortLabel(b.name)
          const lw = label.length * 6.2 + 14
          return (
            <g
              key={b.key}
              style={{ cursor: 'pointer', opacity: dim ? 0.4 : 1 }}
              onClick={(ev) => { ev.stopPropagation(); onSelect(b.key) }}
              onMouseEnter={() => setHovered(b.key)}
              onMouseLeave={() => setHovered((h) => (h === b.key ? null : h))}
            >
              <title>{b.isBucket ? 'Мелкие и одиночные темы' : b.name}</title>
              <circle cx={b.x} cy={b.y} r={b.r + 10} fill={hexRgba(tc, sel || hov ? 0.3 : 0.18)} />
              <circle cx={b.x} cy={b.y} r={b.r} fill={b.isBucket ? 'var(--surface2)' : w.color} stroke={sel ? '#ffffff' : hexRgba(tc, 0.75)} strokeWidth={sel ? 3 : 1.5} />
              <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="central" style={{ font: "700 14px 'JetBrains Mono',monospace", fill: b.isBucket ? 'var(--ink2)' : '#fff', pointerEvents: 'none' }}>{b.count}</text>
              <g pointerEvents="none">
                <rect x={b.x - lw / 2} y={b.y + b.r + 5} width={lw} height={18} rx={5} fill="var(--surface)" opacity={0.92} />
                <text x={b.x} y={b.y + b.r + 14.5} textAnchor="middle" dominantBaseline="central" style={{ font: "600 11.5px 'Instrument Sans',sans-serif", fill: 'var(--ink)' }}>{label}</text>
              </g>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
