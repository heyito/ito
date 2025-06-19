import HomeKit from '@/app/components/home/HomeKit'
import WelcomeKit from '@/app/components/welcome/WelcomeKit'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import GlobalKeyListener from './components/GlobalKeyListener'

export default function App() {
  const { onboardingCompleted } = useOnboardingStore()
  return (
    <>
      {onboardingCompleted ? <HomeKit /> : <WelcomeKit />}
      <GlobalKeyListener />
    </>
  )
}
