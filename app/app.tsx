import { HashRouter, Routes, Route } from 'react-router-dom'
import appIcon from '@/resources/build/icon.png'
import HomeKit from '@/app/components/home/HomeKit'
import WelcomeKit from '@/app/components/welcome/WelcomeKit'
import Pill from '@/app/components/Pill'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { useAuth } from '@/app/components/auth/useAuth'
import GlobalKeyListener from './components/GlobalKeyListener'
import { WindowContextProvider } from '@/lib/window'
import { Auth0Provider } from '@/app/components/auth/Auth0Provider'

const MainApp = () => {
  const { onboardingCompleted } = useOnboardingStore()
  const { isAuthenticated } = useAuth()

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
                <GlobalKeyListener />
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
                  <GlobalKeyListener />
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
