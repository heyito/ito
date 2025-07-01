import { HashRouter, Routes, Route } from 'react-router-dom'
import appIcon from '@/resources/build/icon.png'
import HomeKit from '@/app/components/home/HomeKit'
import WelcomeKit from '@/app/components/welcome/WelcomeKit'
import Pill from '@/app/components/pill/Pill'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { useAuth } from '@/app/components/auth/useAuth'
import { WindowContextProvider } from '@/lib/window'
import { Auth0Provider } from '@/app/components/auth/Auth0Provider'
import { useDeviceChangeListener } from './hooks/useDeviceChangeListener'
import { verifyStoredMicrophone } from './media/microphone'
import { useEffect } from 'react'
import { useGlobalShortcut } from './hooks/useGlobalShortcut'

const MainApp = () => {
  const { onboardingCompleted } = useOnboardingStore()
  const { isAuthenticated } = useAuth()
  useDeviceChangeListener()
  useGlobalShortcut()

  useEffect(() => {
    verifyStoredMicrophone()
  }, [])

  // If authenticated and onboarding completed, show main app
  if (isAuthenticated && onboardingCompleted) {
    return <HomeKit />
  }

  // If authenticated but onboarding not completed, continue onboarding
  return <WelcomeKit />
}

export default function App() {
  return (
    <Auth0Provider>
      <HashRouter>
        <Routes>
          {/* Route for the pill window */}
          <Route
            path="/pill"
            element={
              <>
                <Pill />
              </>
            }
          />

          {/* Default route for the main application window */}
          <Route
            path="/"
            element={
              <>
                <WindowContextProvider
                  titlebar={{ title: 'Ito', icon: appIcon }}
                >
                  <MainApp />
                </WindowContextProvider>
              </>
            }
          />
        </Routes>
      </HashRouter>
    </Auth0Provider>
  )
}
