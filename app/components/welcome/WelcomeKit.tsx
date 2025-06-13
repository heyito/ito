import SignupContent from './contents/SignupContent'
import DataControlContent from './contents/DataControlContent'
import AvatarIcon from './icons/AvatarIcon'
import { Lock } from "@mynaui/icons-react";
import { useState } from 'react'
import './styles.css'

export default function WelcomeKit() {
  const [step, setStep] = useState(1)

  return (
    <div className="w-full h-full bg-background">
      <div className="flex flex-row h-full w-full bg-background">
        <div className="flex flex-col w-[45%] justify-center items-start pl-24">
          {step === 0 ? (
            <SignupContent onContinue={() => setStep(1)} />
          ) : (
            <DataControlContent onBack={() => setStep(step - 1)} />
          )}
        </div>
        <div className="flex w-[55%] items-center justify-center bg-neutral-200 border-l border-border">
          {step === 0 ? <AvatarIcon /> : <Lock style={{ width: 220, height: 220, color: '#D1D5DB' }} />}
        </div>
      </div>
    </div>
  )
}
