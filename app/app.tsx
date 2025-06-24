import { HashRouter, Routes, Route } from 'react-router-dom';
import appIcon from '@/resources/build/icon.png'
import HomeKit from '@/app/components/home/HomeKit';
import WelcomeKit from '@/app/components/welcome/WelcomeKit';
import Pill from '@/app/components/Pill';
import { useOnboardingStore } from '@/app/store/useOnboardingStore';
import GlobalKeyListener from './components/GlobalKeyListener';
import { WindowContextProvider } from '@/lib/window';

const MainApp = () => {
  const { onboardingCompleted } = useOnboardingStore();
  return onboardingCompleted ? <HomeKit /> : <WelcomeKit />;
};

export default function App() {
  return (
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
              <WindowContextProvider titlebar={{ title: 'Ito', icon: appIcon }}>
                <GlobalKeyListener />
                <MainApp />
              </WindowContextProvider>
            </>
          }
        />
      </Routes>
    </HashRouter>
  );
}