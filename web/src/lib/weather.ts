/**
 * Морская метафора funufunu: важность (0–100) = погода на море.
 * Шкала, цвета, волна-спарклайн, работа с цветами зон. См. design_handoff_funufunu.
 */

export type WeatherKey = 'calm' | 'ripple' | 'waves' | 'storm' | 'hurricane'

export interface Weather {
  key: WeatherKey
  label: string
  color: string
  rank: 0 | 1 | 2 | 3 | 4
}

// Пять градаций по диапазонам importance (см. README дизайна).
export const WEATHER_SCALE: Weather[] = [
  { key: 'calm', label: 'Штиль', color: '#6f97a3', rank: 0 },
  { key: 'ripple', label: 'Рябь', color: '#24b3c9', rank: 1 },
  { key: 'waves', label: 'Волны', color: '#3d86e0', rank: 2 },
  { key: 'storm', label: 'Шторм', color: '#7b6cf2', rank: 3 },
  { key: 'hurricane', label: 'Ураган', color: '#f2603f', rank: 4 },
]

/** importance → погода. */
export function weather(v: number): Weather {
  if (v <= 20) return WEATHER_SCALE[0]
  if (v <= 40) return WEATHER_SCALE[1]
  if (v <= 60) return WEATHER_SCALE[2]
  if (v <= 80) return WEATHER_SCALE[3]
  return WEATHER_SCALE[4]
}

/** hex + альфа → rgba() строка (для подложек-пилюль 14–16%). */
export function hexRgba(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

/**
 * SVG-путь «волна-спарклайн»: синусоида с амплитудой, нарастающей слева направо
 * и с важностью. Формулы из хендофа (amp/cycles).
 */
export function wavePath(v: number, w = 46, h = 16): string {
  const mid = h / 2
  const amp = 1.2 + (v / 100) * (h / 2 - 1.6)
  const cyc = 1 + v / 22
  const N = 30
  let d = ''
  for (let i = 0; i <= N; i++) {
    const x = (w * i) / N
    const y = mid - Math.sin(((i / N) * Math.PI * 2 * cyc)) * amp * (0.45 + 0.55 * (i / N))
    d += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1)
  }
  return d
}

// Цвета зон по умолчанию (сид) — используются как фолбэк, когда у Area нет color.
const AREA_FALLBACK_COLORS: Record<string, string> = {
  Работа: '#37b7c9',
  Финансы: '#5a8fe6',
  Здоровье: '#3fbf8f',
  Семья: '#c98ad0',
  Личное: '#e0a95a',
}

export function areaColor(name?: string | null, color?: string | null): string {
  if (color) return color
  if (name && AREA_FALLBACK_COLORS[name]) return AREA_FALLBACK_COLORS[name]
  return '#8098a2'
}

// Статусы процессов → подпись + цвет.
export const PROCESS_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'активен', color: '#3fbf8f' },
  frozen: { label: 'заморожен', color: '#6f97a3' },
  closed: { label: 'затих', color: '#65808c' },
}

// Типы связей в графе процессов → цвет + штрих.
export const RELATION_STYLE: Record<string, { color: string; dash: string; label: string }> = {
  causal: { color: '#f2603f', dash: '0', label: 'причинно-следственная' },
  follow_up: { color: '#7b6cf2', dash: '7 5', label: 'продолжение' },
  related: { color: '#3d86e0', dash: '2 6', label: 'связано' },
  same_entity: { color: '#24b3c9', dash: '0', label: 'та же сущность' },
  same_project: { color: '#3fbf8f', dash: '4 4', label: 'общий проект' },
}
