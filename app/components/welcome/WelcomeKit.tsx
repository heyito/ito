import SignupContent from './contents/SignupContent'
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

export default function WelcomeKit() {
  const { onboardingStep } = useOnboardingStore();
  
  const { 
    setAccessibilityEnabled,
    setMicrophoneEnabled
  } = usePermissionsStore();
  

  useEffect(() => {
    window.api.invoke('check-accessibility-permission', false).then((enabled: boolean) => {
      setAccessibilityEnabled(enabled);
    });

    window.api.invoke('check-microphone-permission', false).then((enabled: boolean) => {
      setMicrophoneEnabled(enabled);
    });
  }, [setAccessibilityEnabled, setMicrophoneEnabled]);

  return (
    <div className="w-full h-full bg-background">
      {onboardingStep === 0 ? (
        <SignupContent />
      ) : onboardingStep === 1 ? (
        <DataControlContent />
      ) : onboardingStep === 2 ? (
        <PermissionsContent />
      ) : onboardingStep === 3 ? (
        <MicrophoneTestContent />
      ) : onboardingStep === 4 ? (
        <KeyboardTestContent />
      ) : onboardingStep === 5 ? (
        <GoodToGoContent />
      ) : onboardingStep === 6 ? (
        <AnyAppContent />
      ) : onboardingStep === 7 ? (
        <TryItOutContent />
      ) : null}
    </div>
  )
}
