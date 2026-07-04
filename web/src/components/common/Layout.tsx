/**
 * Каркас funufunu: на десктопе — левый сайдрейл (212px), на телефоне — нижний
 * таббар + верхняя шапка с датой. Пять основных разделов (Сводка/Лента/Треды/
 * Процессы/Связи) — иконками; вторичные (GTD/Правила/Таймлайн/Статистика/
 * Настройки) — в «Ещё». Переключатель тёмной/светлой темы.
 */
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'

type IconName = 'digest' | 'feed' | 'threads' | 'proc' | 'relations'

function Icon({ name, color, size = 17 }: { name: IconName; color: string; size?: number }) {
  const common = { fill: 'none', stroke: color } as const
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flex: 'none' }}>
      {name === 'digest' && (
        <>
          <circle cx="10" cy="10" r="7" strokeWidth="1.5" {...common} />
          <path d="M13 7 L11.2 11.2 L7 13 L8.8 8.8 Z" fill={color} />
        </>
      )}
      {name === 'feed' && (
        <>
          <path d="M3 5.5 q2.4 -2.4 4.7 0 t4.7 0 t4.7 0" strokeWidth="1.6" strokeLinecap="round" {...common} />
          <path d="M3 10 q2.4 -2.4 4.7 0 t4.7 0 t4.7 0" strokeWidth="1.6" strokeLinecap="round" {...common} />
          <path d="M3 14.5 q2.4 -2.4 4.7 0 t4.7 0 t4.7 0" strokeWidth="1.6" strokeLinecap="round" {...common} />
        </>
      )}
      {name === 'threads' && (
        <>
          <circle cx="10" cy="10" r="6.8" strokeWidth="1.5" {...common} />
          <circle cx="10" cy="10" r="2.5" fill={color} />
        </>
      )}
      {name === 'proc' && (
        <>
          <line x1="3" y1="5.5" x2="12.5" y2="5.5" strokeWidth="2.4" strokeLinecap="round" {...common} />
          <line x1="6.5" y1="10" x2="17" y2="10" strokeWidth="2.4" strokeLinecap="round" {...common} />
          <line x1="3.5" y1="14.5" x2="11" y2="14.5" strokeWidth="2.4" strokeLinecap="round" {...common} />
        </>
      )}
      {name === 'relations' && (
        <>
          <line x1="6.5" y1="8" x2="9.2" y2="12.8" strokeWidth="1.3" {...common} />
          <line x1="13.6" y1="7" x2="10.9" y2="12.6" strokeWidth="1.3" {...common} />
          <line x1="7.7" y1="5.9" x2="12.6" y2="5.2" strokeWidth="1.3" {...common} />
          <circle cx="5.5" cy="6.2" r="2.3" fill={color} />
          <circle cx="14.8" cy="5" r="2.3" fill={color} />
          <circle cx="10" cy="14.8" r="2.3" fill={color} />
        </>
      )}
    </svg>
  )
}

const PRIMARY: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Сводка', icon: 'digest', end: true },
  { to: '/feed', label: 'Лента', icon: 'feed' },
  { to: '/groups', label: 'Треды', icon: 'threads' },
  { to: '/processes', label: 'Процессы', icon: 'proc' },
  { to: '/relations', label: 'Связи', icon: 'relations' },
]

const SECONDARY = [
  { to: '/gtd', label: 'GTD' },
  { to: '/rules', label: 'Правила' },
  { to: '/timeline', label: 'Таймлайн' },
  { to: '/stats', label: 'Статистика' },
  { to: '/settings', label: 'Настройки' },
]

function Logo({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 11,
        background: 'linear-gradient(150deg,#37c0d4,#2a6fdb)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 5px 16px rgba(42,111,219,.42)', flex: 'none',
      }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 20 20">
        <path d="M2 12 q3 -4 5 0 t5 0 t5 0" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M2 7 q3 -3 5 0 t5 0 t5 0" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity=".55" />
      </svg>
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: 'none',
        borderRadius: 10, padding: '8px 12px', cursor: 'pointer', color: 'var(--ink2)',
        font: "600 12px/1 'Instrument Sans',sans-serif",
      }}
    >
      <span style={{ fontSize: 13 }}>{theme === 'dark' ? '●' : '○'}</span>
      {theme === 'dark' ? 'Тёмная' : 'Светлая'}
    </button>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  useTheme() // гарантируем, что data-theme проставлен на старте

  const secActive = SECONDARY.some((s) => pathname.startsWith(s.to) && s.to !== '/')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* ── Десктоп: левый сайдрейл ── */}
      <nav
        className="hidden md:flex"
        style={{ flexDirection: 'column', width: 212, flex: 'none', background: 'var(--bg2)', padding: '16px 12px', gap: 3, position: 'sticky', top: 0, height: '100vh' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px 16px' }}>
          <Logo size={30} />
          <span className="font-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>funufunu</span>
        </div>
        {PRIMARY.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}>
            {({ isActive }) => {
              const c = isActive ? 'var(--accent)' : 'var(--ink3)'
              return (
                <span
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', borderRadius: 10,
                    background: isActive ? 'color-mix(in oklab, var(--accent) 16%, transparent)' : 'transparent',
                  }}
                >
                  <Icon name={it.icon} color={c} />
                  <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: c }}>{it.label}</span>
                </span>
              )
            }}
          </NavLink>
        ))}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 6px 4px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {SECONDARY.map((s) => (
              <NavLink
                key={s.to}
                to={s.to}
                className="font-mono"
                style={({ isActive }) => ({
                  fontSize: 10, padding: '4px 7px', borderRadius: 7,
                  color: isActive ? 'var(--accent)' : 'var(--ink3)',
                  background: isActive ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'transparent',
                })}
              >
                {s.label}
              </NavLink>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </nav>

      {/* ── Контент + мобильная шапка/таббар ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Мобильная шапка */}
        <header
          className="flex md:hidden"
          style={{ alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', background: 'var(--bg2)', position: 'sticky', top: 0, zIndex: 30 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Logo size={30} />
            <span className="font-display" style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>funufunu</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <ThemeToggle />
            <button
              onClick={() => setMoreOpen((o) => !o)}
              className="font-mono"
              style={{ background: secActive ? 'color-mix(in oklab, var(--accent) 16%, transparent)' : 'var(--surface2)', border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', color: secActive ? 'var(--accent)' : 'var(--ink2)', fontSize: 12 }}
            >
              Ещё
            </button>
            {moreOpen && (
              <div
                style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--surface)', borderRadius: 12, boxShadow: 'var(--shadow-card)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 40, minWidth: 150 }}
              >
                {SECONDARY.map((s) => (
                  <NavLink
                    key={s.to}
                    to={s.to}
                    onClick={() => setMoreOpen(false)}
                    style={({ isActive }) => ({
                      padding: '8px 11px', borderRadius: 8, font: "500 13px/1 'Instrument Sans',sans-serif",
                      color: isActive ? 'var(--accent)' : 'var(--ink2)',
                      background: isActive ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'transparent',
                    })}
                  >
                    {s.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </header>

        <main style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </main>

        {/* Мобильный таббар */}
        <nav
          className="flex md:hidden"
          style={{ flex: 'none', background: 'var(--bg2)', padding: '10px 8px 22px', position: 'sticky', bottom: 0, zIndex: 30 }}
        >
          {PRIMARY.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} style={{ flex: 1 }}>
              {({ isActive }) => {
                const c = isActive ? 'var(--accent)' : 'var(--ink3)'
                return (
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '5px 2px' }}>
                    <Icon name={it.icon} color={c} size={22} />
                    <span style={{ font: "600 10px/1 'Instrument Sans',sans-serif", color: c }}>{it.label}</span>
                  </span>
                )
              }}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
