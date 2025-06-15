import HomeKit from '@/app/components/home/HomeKit'
import WelcomeKit from '@/app/components/welcome/WelcomeKit'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'

export default function App() {
  const { onboardingCompleted } = useOnboardingStore()
  return onboardingCompleted ? <HomeKit /> : <WelcomeKit />
}
