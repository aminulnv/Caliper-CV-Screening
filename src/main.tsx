import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/lib/auth'
import { AuthProvider } from '@/contexts/AuthContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { NotificationsProvider } from '@/contexts/NotificationsContext'
import App from './App'
import { applyBrandTheme } from '@/config/brand-theme'
import { assets } from '@/config/assets'
import './index.css'
import '@/caliper/caliper.css'

applyBrandTheme(assets.layoutBackgroundValue)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SettingsProvider>
        <NotificationsProvider>
          <App />
        </NotificationsProvider>
      </SettingsProvider>
    </AuthProvider>
  </StrictMode>,
)
