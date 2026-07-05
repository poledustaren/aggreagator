/**
 * Граф связей в стиле funufunu — bespoke SVG вместо vis-network.
 * Узлы-«циклоны»: радиус по числу событий, цвет/балл по важности процесса (H7),
 * glow-подложка. Рёбра — по типу связи (причина/продолжение/связано, см. RELATION_STYLE).
 * Раскладка — лёгкий force-directed (детерминированный сид, считается один раз).
 * Клик по узлу/ребру — выбор (деталь в панели справа). Понятнее и в морском стиле.
 */
import { useMemo } from 'react'
import type { GraphEdge, GraphNode } from '../../types/api'
import { RELATION_STYLE, hexRgba, weather } from '../../lib/weather'

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edge: GraphEdge) => void
  onDeselect: () => void
  highlightNodeId?: string | null
}

const W = 680
const H = 460
const PAD = 46

function nodeRadius(itemCount: number): number {
  return 13 + Math.min(23, Math.sqrt(Math.max(0, itemCount)) * 3.2)
}

// Детерминированная force-directed раскладка (Fruchterman–Reingold-lite).
function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const n = nodes.length
  const pos = new Map<string, { x: number; y: number }>()
  if (n === 0) return pos
  const cx = W / 2, cy = H / 2
  // Сид по кругу (без random — стабильно между рендерами).
  nodes.forEach((nd, i) => {
    const a = (2 * Math.PI * i) / n
    pos.set(nd.id, { x: cx + Math.cos(a) * (W / 3.4), y: cy + Math.sin(a) * (H / 3.4) })
  })
  if (n === 1) { pos.set(nodes[0].id, { x: cx, y: cy }); return pos }

  const area = (W - 2 * PAD) * (H - 2 * PAD)
  const k = Math.sqrt(area / n) * 0.75 // идеальная дистанция
  const idset = new Set(nodes.map((x) => x.id))
  const links = edges.filter((e) => idset.has(e.source) && idset.has(e.target))

  let temp = W / 8
  const ITER = 320
  for (let it = 0; it < ITER; it++) {
    const disp = new Map<string, { x: number; y: number }>()
    nodes.forEach((nd) => disp.set(nd.id, { x: 0, y: 0 }))
    // Отталкивание всех пар.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(nodes[i].id)!, b = pos.get(nodes[j].id)!
        let dx = a.x - b.x, dy = a.y - b.y
        let d = Math.hypot(dx, dy) || 0.01
        const f = (k * k) / d
        dx = (dx / d) * f; dy = (dy / d) * f
        const da = disp.get(nodes[i].id)!, db = disp.get(nodes[j].id)!
        da.x += dx; da.y += dy; db.x -= dx; db.y -= dy
      }
    }
    // Притяжение по рёбрам.
    for (const e of links) {
      const a = pos.get(e.source)!, b = pos.get(e.target)!
      let dx = a.x - b.x, dy = a.y - b.y
      const d = Math.hypot(dx, dy) || 0.01
      const f = (d * d) / k
      dx = (dx / d) * f; dy = (dy / d) * f
      const da = disp.get(e.source)!, db = disp.get(e.target)!
      da.x -= dx; da.y -= dy; db.x += dx; db.y += dy
    }
    // Смещение + охлаждение + слабая гравитация к центру.
    nodes.forEach((nd) => {
      const p = pos.get(nd.id)!, dp = disp.get(nd.id)!
      const d = Math.hypot(dp.x, dp.y) || 0.01
      p.x += (dp.x / d) * Math.min(d, temp)
      p.y += (dp.y / d) * Math.min(d, temp)
      p.x += (cx - p.x) * 0.012
      p.y += (cy - p.y) * 0.012
      p.x = Math.max(PAD, Math.min(W - PAD, p.x))
      p.y = Math.max(PAD, Math.min(H - PAD, p.y))
    })
    temp = Math.max(2, temp * 0.965)
  }
  return pos
}

function shortLabel(title: string | null): string {
  const t = (title ?? 'процесс').trim()
  return t.length > 18 ? t.slice(0, 17) + '…' : t
}

export function RelationsGraphSvg({ nodes, edges, onSelectNode, onSelectEdge, onDeselect, highlightNodeId }: Props) {
  const layout = useMemo(() => computeLayout(nodes, edges), [nodes, edges])
  const relTypes = useMemo(() => [...new Set(edges.map((e) => e.relation))].filter((r) => RELATION_STYLE[r]), [edges])

  return (
    <div>
      <div
        style={{ borderRadius: 20, boxShadow: 'var(--shadow-card)', background: 'radial-gradient(130% 120% at 50% 0%, var(--surface2), var(--surface))', overflow: 'hidden', padding: 8 }}
        onClick={onDeselect}
      >
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Граф связей процессов">
          {/* Рёбра */}
          {edges.map((e, i) => {
            const a = layout.get(e.source), b = layout.get(e.target)
            if (!a || !b) return null
            const st = RELATION_STYLE[e.relation] ?? RELATION_STYLE.related
            return (
              <g key={`e${i}`} style={{ cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); onSelectEdge(e) }}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={12} />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={st.color} strokeWidth={2} opacity={0.5 + 0.4 * (e.confidence ?? 0.5)} strokeDasharray={st.dash} />
              </g>
            )
          })}
          {/* Узлы-циклоны */}
          {nodes.map((nd) => {
            const p = layout.get(nd.id)
            if (!p) return null
            const w = weather(nd.importance)
            const r = nodeRadius(nd.item_count)
            const sel = highlightNodeId === nd.id
            return (
              <g key={nd.id} style={{ cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); onSelectNode(nd.id) }}>
                <circle cx={p.x} cy={p.y} r={r + 11} fill={hexRgba(w.color, 0.16)} />
                <circle cx={p.x} cy={p.y} r={r} fill={w.color} stroke={sel ? '#ffffff' : hexRgba(w.color, 0.65)} strokeWidth={sel ? 3 : 1.5} />
                <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" style={{ font: "700 12px 'JetBrains Mono',monospace", fill: '#fff', pointerEvents: 'none' }}>{nd.importance}</text>
                <text x={p.x} y={p.y + r + 15} textAnchor="middle" style={{ font: "600 11px 'Instrument Sans',sans-serif", fill: 'var(--ink)', pointerEvents: 'none' }}>{shortLabel(nd.title)}</text>
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
