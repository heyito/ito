import { HashRouter, Routes, Route } from 'react-router-dom';
import appIcon from '@/resources/build/icon.png'
import HomeKit from '@/app/components/home/HomeKit';
import WelcomeKit from '@/app/components/welcome/WelcomeKit';
import Pill from '@/app/components/Pill';
import AuthCallback from '@/app/components/auth/AuthCallback';
import { useOnboardingStore } from '@/app/store/useOnboardingStore';
import { useAuth } from '@/app/components/auth/useAuth';
import GlobalKeyListener from './components/GlobalKeyListener';
import { WindowContextProvider } from '@/lib/window';
import { Auth0Provider } from '@/app/components/auth/Auth0Provider';
import { useEffect } from 'react';

const MainApp = () => {
  const { onboardingCompleted, onboardingStep, resetOnboarding } = useOnboardingStore();
  const { isAuthenticated, isLoading, user } = useAuth();

  // Reset onboarding if user is not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated && onboardingStep !== 0) {
      resetOnboarding();
    }
  }, [isAuthenticated, isLoading, onboardingStep, resetOnboarding]);

  // Show loading state while Auth0 is checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2 text-foreground">Loading...</h1>
          <p className="text-muted-foreground">Checking authentication status</p>
        </div>
      </div>
    );
  }

  // If not authenticated, always show onboarding starting from CreateAccountContent
  if (!isAuthenticated) {
    return <WelcomeKit />;
  }

  // If authenticated and onboarding completed, show main app
  if (onboardingCompleted) {
    return <HomeKit />;
  }

  // If authenticated but onboarding not completed, continue onboarding
  return <WelcomeKit />;
};

export default function App() {
  return (
    <Auth0Provider>
      <HashRouter>
        <Routes>
          {/* Route for the pill window */}
          <Route path="/pill" element={<Pill />} />

          {/* Auth0 callback route */}
          <Route 
            path="/callback" 
            element={
              <WindowContextProvider titlebar={{ title: 'Ito - Authentication', icon: appIcon }}>
                <AuthCallback />
              </WindowContextProvider>
            } 
          />

          {/* Default route for the main application window */}
          <Route
            path="/"
            element={
              <>
                <WindowContextProvider titlebar={{ title: 'Ito', icon: appIcon }}>
                  <GlobalKeyListener />
                  <MainApp />
                </WindowContextProvider>
              </>
            }
          />
        </Routes>
      </HashRouter>
    </Auth0Provider>
  );
}