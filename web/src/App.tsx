import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/common/Layout'
import { RequireSettings } from './components/common/RequireSettings'
import { FeedPage } from './pages/FeedPage'
import { GroupsPage } from './pages/GroupsPage'
import { GtdPage } from './pages/GtdPage'
import { RulesPage } from './pages/RulesPage'
import { SettingsPage } from './pages/SettingsPage'
import { TimelinePage } from './pages/TimelinePage'
import { StatsPage } from './pages/StatsPage'
import { ProcessesPage } from './pages/ProcessesPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route
              index
              element={
                <RequireSettings>
                  <FeedPage />
                </RequireSettings>
              }
            />
            <Route
              path="groups"
              element={
                <RequireSettings>
                  <GroupsPage />
                </RequireSettings>
              }
            />
            <Route
              path="gtd"
              element={
                <RequireSettings>
                  <GtdPage />
                </RequireSettings>
              }
            />
            <Route
              path="rules"
              element={
                <RequireSettings>
                  <RulesPage />
                </RequireSettings>
              }
            />
            <Route
              path="processes"
              element={
                <RequireSettings>
                  <ProcessesPage />
                </RequireSettings>
              }
            />
            <Route
              path="timeline"
              element={
                <RequireSettings>
                  <TimelinePage />
                </RequireSettings>
              }
            />
            <Route
              path="stats"
              element={
                <RequireSettings>
                  <StatsPage />
                </RequireSettings>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
