import SignupContent from './contents/SignupContent'
import DataControlContent from './contents/DataControlContent'
import SetupItoContent from './contents/SetupItoContent'
import { useState } from 'react'
import './styles.css'

export default function WelcomeKit() {
  const [step, setStep] = useState(2)

  return (
    <div className="w-full h-full bg-background">
      {step === 0 ? (
        <SignupContent onContinue={() => setStep(1)} />
      ) : step === 1 ? (
        <DataControlContent onBack={() => setStep(0)} onContinue={() => setStep(2)} />
      ) : (
        <SetupItoContent onBack={() => setStep(1)} />
      )}
    </div>
  )
}
