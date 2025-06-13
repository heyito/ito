import SignupContent from './contents/SignupContent'
import DataControlContent from './contents/DataControlContent'
import PermissionsContent from './contents/PermissionsContent'
import { useState, useEffect } from 'react'
import './styles.css'
import { usePermissionsStore } from '../../store/usePermissionsStore'

export default function WelcomeKit() {
  const [step, setStep] = useState(0)
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
      {step === 0 ? (
        <SignupContent onContinue={() => setStep(1)} />
      ) : step === 1 ? (
        <DataControlContent onBack={() => setStep(0)} onContinue={() => setStep(2)} />
      ) : (
        <PermissionsContent onBack={() => setStep(1)} />
      )}
    </div>
  )
}
