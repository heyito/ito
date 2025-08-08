import CreateAccountContent from './contents/CreateAccountContent'
import SignInContent from './contents/SignInContent'
import ReferralContent from './contents/ReferralContent'
import DataControlContent from './contents/DataControlContent'
import PermissionsContent from './contents/PermissionsContent'
import MicrophoneTestContent from './contents/MicrophoneTestContent'
import KeyboardTestContent from './contents/KeyboardTestContent'
import GoodToGoContent from './contents/GoodToGoContent'
import AnyAppContent from './contents/AnyAppContent'
import TryItOutContent from './contents/TryItOutContent'
import { useEffect } from 'react'
import './styles.css'
import { usePermissionsStore } from '../../store/usePermissionsStore'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { useAuthStore } from '@/app/store/useAuthStore'
import { useDictionaryStore } from '@/app/store/useDictionaryStore'

export default function WelcomeKit() {
  const { onboardingStep, totalOnboardingSteps, setOnboardingCompleted } =
    useOnboardingStore()
  const { isAuthenticated, user } = useAuthStore()
  const { addEntry } = useDictionaryStore()

  const { setAccessibilityEnabled, setMicrophoneEnabled } =
    usePermissionsStore()

  useEffect(() => {
    window.api
      .invoke('check-accessibility-permission', false)
      .then((enabled: boolean) => {
        setAccessibilityEnabled(enabled)
      })

    window.api
      .invoke('check-microphone-permission', false)
      .then((enabled: boolean) => {
        setMicrophoneEnabled(enabled)
      })
  }, [setAccessibilityEnabled, setMicrophoneEnabled])

  useEffect(() => {
    if (onboardingStep >= totalOnboardingSteps) {
      setOnboardingCompleted()
    }
  }, [
    onboardingStep,
    totalOnboardingSteps,
    addEntry,
    user,
    setOnboardingCompleted,
  ])

  // Show signin/signup based on whether user has previous auth data
  if (!isAuthenticated) {
    if (user) {
      // Returning user who needs to sign back in
      return <SignInContent />
    } else {
      // New user who needs to create an account
      return <CreateAccountContent />
    }
  }

  return (
    <div className="w-full h-full bg-background">
      {onboardingStep === 0 ? (
        <CreateAccountContent />
      ) : onboardingStep === 1 ? (
        <ReferralContent />
      ) : onboardingStep === 2 ? (
        <DataControlContent />
      ) : onboardingStep === 3 ? (
        <PermissionsContent />
      ) : onboardingStep === 4 ? (
        <MicrophoneTestContent />
      ) : onboardingStep === 5 ? (
        <KeyboardTestContent />
      ) : onboardingStep === 6 ? (
        <GoodToGoContent />
      ) : onboardingStep === 7 ? (
        <AnyAppContent />
      ) : onboardingStep === 8 ? (
        <TryItOutContent />
      ) : null}
    </div>
  )
}
