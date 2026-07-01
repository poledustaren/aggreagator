import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyBootstrapFromUrl } from './api/settings'

// Если приложение открыло портал с токеном в URL (#token=...), подхватываем его
// ДО рендера — тогда экран уже будет сконфигурирован и лента откроется сразу.
applyBootstrapFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
