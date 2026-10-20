import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyToDocument } from './i18n/locale'
import './ui/theme'
import App from './App.tsx'

applyToDocument()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
