/**
 * Общий каркас страниц: верхняя навигация + область контента.
 */

import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: 'Сводка', end: true },
  { to: '/feed', label: 'Лента' },
  { to: '/groups', label: 'Треды' },
  { to: '/gtd', label: 'GTD' },
  { to: '/rules', label: 'Правила' },
  { to: '/processes', label: 'Процессы' },
  { to: '/timeline', label: 'Таймлайн' },
  { to: '/stats', label: 'Статистика' },
  { to: '/settings', label: 'Настройки' },
]

export function Layout() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <nav className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto p-3">
          <span className="mr-3 shrink-0 font-semibold text-neutral-200">Aggregat</span>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 rounded-md px-3 py-1.5 text-sm ${
                  isActive ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:bg-neutral-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
