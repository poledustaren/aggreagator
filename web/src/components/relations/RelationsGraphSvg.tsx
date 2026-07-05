/**
 * Граф связей в стиле funufunu — bespoke SVG вместо force-directed «ожерелья».
 *
 * Раскладка — тематическими кластерами-«штормовыми ячейками»: LLM группирует
 * процессы по темам, каждая тема пакуется отдельной сунфлауэр-спиралью (golden
 * angle), ячейки разносятся по эллипсу, крупнейшая — в центре. Так одинокие
 * (без явных рёбер) процессы больше не сбиваются в кольцо, а собираются по темам.
 *
 * Кодировка: halo-подложка = цвет темы (видно группировку), ядро = погода по
 * важности (H7), балл внутри. Рёбра между ячейками = связи вне темы (те самые
 * «неочевидные»). Подписи не мусорят: показываются у лидера темы, выбранного и
 * под курсором (+ нативный tooltip на каждом узле).
 */
import { useMemo, useState } from 'react'
import type { GraphEdge, GraphNode } from '../../types/api'
import { RELATION_STYLE, hexRgba, weather } from '../../lib/weather'

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edge: GraphEdge) => void
  onDeselect: () => void
  highlightNodeId?: string | null
  themeColor: (theme: string | null) => string
}

const W = 760
const H = 520
const PAD = 54
const NO_THEME = '∅'
const GOLDEN = 2.399963229728653 // золотой угол (рад) для равномерной сунфлауэр-упаковки

function nodeRadius(itemCount: number): number {
  return 12 + Math.min(20, Math.sqrt(Math.max(0, itemCount)) * 2.9)
}

// Радиус тематической ячейки — растёт по числу узлов в теме.
function clusterRadius(count: number): number {
  return count <= 1 ? 0 : 22 + Math.sqrt(count) * 17
}

interface Placed {
  node: GraphNode
  x: number
  y: number
  r: number
  theme: string
  lead: boolean
}

/** Детерминированная раскладка: тематические кластеры, сунфлауэр-упаковка. */
function computeLayout(nodes: GraphNode[]): Map<string, Placed> {
  const placed = new Map<string, Placed>()
  const n = nodes.length
  if (n === 0) return placed
  const cx = W / 2, cy = H / 2

  // Группировка по темам + лидер каждой темы (макс. важность, затем активность).
  const groups = new Map<string, GraphNode[]>()
  for (const nd of nodes) {
    const key = nd.theme ?? NO_THEME
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(nd)
  }
  const leadId = new Map<string, string>()
  for (const [key, members] of groups) {
    const lead = [...members].sort((a, b) => b.importance - a.importance || b.item_count - a.item_count)[0]
    leadId.set(key, lead.id)
    // Внутри темы — стабильный порядок (важные ближе к центру ячейки).
    members.sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id))
  }

  // Темы по убыванию размера: крупнейшая — в центр, остальные — по эллипсу.
  const themes = [...groups.keys()].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length)
  const T = themes.length

  const anchors = new Map<string, { x: number; y: number }>()
  if (T === 1) {
    anchors.set(themes[0], { x: cx, y: cy })
  } else {
    const centerTheme = themes[0]
    anchors.set(centerTheme, { x: cx, y: cy })
    const ring = themes.slice(1)
    const rx = W / 2 - PAD - 24
    const ry = H / 2 - PAD - 24
    ring.forEach((t, i) => {
      const a = (2 * Math.PI * i) / ring.length - Math.PI / 2
      anchors.set(t, { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry })
    })
  }

  for (const theme of themes) {
    const members = groups.get(theme)!
    const an = anchors.get(theme)!
    const cr = clusterRadius(members.length)
    members.forEach((nd, m) => {
      const rr = members.length === 1 ? 0 : cr * Math.sqrt((m + 0.5) / members.length)
      const ang = m * GOLDEN
      const x = Math.max(PAD, Math.min(W - PAD, an.x + Math.cos(ang) * rr))
      const y = Math.max(PAD, Math.min(H - PAD, an.y + Math.sin(ang) * rr))
      placed.set(nd.id, { node: nd, x, y, r: nodeRadius(nd.item_count), theme, lead: leadId.get(theme) === nd.id })
    })
  }
  return placed
}

function shortLabel(title: string | null): string {
  const t = (title ?? 'процесс').trim()
  return t.length > 22 ? t.slice(0, 21) + '…' : t
}

export function RelationsGraphSvg({ nodes, edges, onSelectNode, onSelectEdge, onDeselect, highlightNodeId, themeColor }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const layout = useMemo(() => computeLayout(nodes), [nodes])
  const relTypes = useMemo(() => [...new Set(edges.map((e) => e.relation))].filter((r) => RELATION_STYLE[r]), [edges])

  // Подпись показываем только у лидера темы, выбранного и наведённого узла.
  const labelFor = (id: string, lead: boolean) => lead || highlightNodeId === id || hovered === id

  return (
    <div>
      <div
        style={{ borderRadius: 20, boxShadow: 'var(--shadow-card)', background: 'radial-gradient(130% 120% at 50% 0%, var(--surface2), var(--surface))', overflow: 'hidden', padding: 8 }}
        onClick={onDeselect}
      >
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Граф связей процессов">
          {/* Рёбра. Связи вне темы (между ячейками) заметнее — они и есть «неочевидные». */}
          {edges.map((e, i) => {
            const a = layout.get(e.source), b = layout.get(e.target)
            if (!a || !b) return null
            const st = RELATION_STYLE[e.relation] ?? RELATION_STYLE.related
            const crossTheme = a.theme !== b.theme
            const touchesSel = highlightNodeId != null && (e.source === highlightNodeId || e.target === highlightNodeId)
            const op = (crossTheme ? 0.5 : 0.24) + 0.35 * (e.confidence ?? 0.5)
            return (
              <g key={`e${i}`} style={{ cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); onSelectEdge(e) }}>
                <title>{e.reason}</title>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} />
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={st.color}
                  strokeWidth={touchesSel ? 3 : crossTheme ? 2.2 : 1.6}
                  opacity={touchesSel ? 0.95 : Math.min(1, op)}
                  strokeDasharray={st.dash}
                />
              </g>
            )
          })}
          {/* Узлы-циклоны. */}
          {[...layout.values()].map(({ node: nd, x, y, r, theme, lead }) => {
            const w = weather(nd.importance)
            const sel = highlightNodeId === nd.id
            const hov = hovered === nd.id
            const tc = themeColor(theme === NO_THEME ? null : theme)
            const showLabel = labelFor(nd.id, lead)
            const label = shortLabel(nd.title)
            const lw = label.length * 6.1 + 12
            return (
              <g
                key={nd.id}
                style={{ cursor: 'pointer' }}
                onClick={(ev) => { ev.stopPropagation(); onSelectNode(nd.id) }}
                onMouseEnter={() => setHovered(nd.id)}
                onMouseLeave={() => setHovered((h) => (h === nd.id ? null : h))}
              >
                <title>{nd.title ?? '(без названия)'}{theme !== NO_THEME ? ` · тема: ${theme}` : ''}</title>
                {/* halo = цвет темы (группировка). */}
                <circle cx={x} cy={y} r={r + 12} fill={hexRgba(tc, sel || hov ? 0.26 : 0.16)} />
                {/* ядро = погода по важности. */}
                <circle cx={x} cy={y} r={r} fill={w.color} stroke={sel ? '#ffffff' : hexRgba(w.color, 0.7)} strokeWidth={sel ? 3 : 1.5} />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" style={{ font: "700 12px 'JetBrains Mono',monospace", fill: '#fff', pointerEvents: 'none' }}>{nd.importance}</text>
                {showLabel && (
                  <g pointerEvents="none">
                    <rect x={x - lw / 2} y={y + r + 5} width={lw} height={17} rx={5} fill="var(--surface)" opacity={0.92} />
                    <text x={x} y={y + r + 13.5} textAnchor="middle" dominantBaseline="central" style={{ font: "600 11px 'Instrument Sans',sans-serif", fill: 'var(--ink)' }}>{label}</text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {/* Легенда типов связей (только присутствующие). */}
      {relTypes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
          {relTypes.map((r) => {
            const st = RELATION_STYLE[r]
            return (
              <div key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke={st.color} strokeWidth="2.4" strokeDasharray={st.dash} /></svg>
                <span style={{ font: "500 11px/1 'Instrument Sans',sans-serif", color: 'var(--ink2)' }}>{st.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
