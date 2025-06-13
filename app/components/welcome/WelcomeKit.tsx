import SignupContent from './contents/SignupContent'
import DataControlContent from './contents/DataControlContent'
import { useState } from 'react'
import './styles.css'

export default function WelcomeKit() {
  const [step, setStep] = useState(1)

  return (
    <div className="w-full h-full bg-background">
      {step === 0 ? (
        <SignupContent onContinue={() => setStep(1)} />
      ) : (
        <DataControlContent onBack={() => setStep(step - 1)} />
      )}
    </div>
  )
}
