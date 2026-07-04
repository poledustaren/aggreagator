import { lazy, Suspense, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/common/Layout'
import { RequireSettings } from './components/common/RequireSettings'
import { LoadingState } from './components/common/StateViews'
// Первичные экраны — в основном бандле (быстрый лендинг).
import { DigestPage } from './pages/DigestPage'
import { FeedPage } from './pages/FeedPage'
import { GroupsPage } from './pages/GroupsPage'

// Вторичные и «тяжёлые» экраны — отдельными чанками, подгружаются по заходу.
// Processes/Timeline/Relations тянут vis-network/vis-timeline (~половина бандла) —
// незачем грузить их на главной.
const GtdPage = lazy(() => import('./pages/GtdPage').then((m) => ({ default: m.GtdPage })))
const RulesPage = lazy(() => import('./pages/RulesPage').then((m) => ({ default: m.RulesPage })))
const ProcessesPage = lazy(() => import('./pages/ProcessesPage').then((m) => ({ default: m.ProcessesPage })))
const TimelinePage = lazy(() => import('./pages/TimelinePage').then((m) => ({ default: m.TimelinePage })))
const RelationsPage = lazy(() => import('./pages/RelationsPage').then((m) => ({ default: m.RelationsPage })))
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

// Гард настроек + граница Suspense для ленивых чанков (каркас Layout остаётся на месте).
function guarded(node: ReactNode) {
  return (
    <RequireSettings>
      <Suspense fallback={<LoadingState label="Загрузка…" />}>{node}</Suspense>
    </RequireSettings>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={guarded(<DigestPage />)} />
            <Route path="feed" element={guarded(<FeedPage />)} />
            <Route path="groups" element={guarded(<GroupsPage />)} />
            <Route path="gtd" element={guarded(<GtdPage />)} />
            <Route path="rules" element={guarded(<RulesPage />)} />
            <Route path="processes" element={guarded(<ProcessesPage />)} />
            <Route path="timeline" element={guarded(<TimelinePage />)} />
            <Route path="relations" element={guarded(<RelationsPage />)} />
            <Route path="stats" element={guarded(<StatsPage />)} />
            <Route
              path="settings"
              element={
                <Suspense fallback={<LoadingState label="Загрузка…" />}>
                  <SettingsPage />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
