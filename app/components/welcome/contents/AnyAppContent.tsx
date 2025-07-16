import { Button } from '@/app/components/ui/button'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { AppOrbitImage } from '@/app/components/ui/app-orbit-image'

export default function AnyAppContent() {
  const { incrementOnboardingStep, decrementOnboardingStep } =
    useOnboardingStore()

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start px-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12">
          <div className="mt-8">
            <button
              className="mb-4 text-sm text-muted-foreground hover:underline"
              type="button"
              onClick={decrementOnboardingStep}
            >
              &lt; Back
            </button>
            <h1 className="text-3xl mb-4 mt-12">Ito works in any app.</h1>
            <p className="text-base text-muted-foreground mt-6">
              From emails to chats to documents—Ito works in any textbox on your
              computer.
            </p>
          </div>
          <div className="flex flex-col items-start mb-8">
            <Button className="w-24" onClick={incrementOnboardingStep}>
              Continue
            </Button>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-gradient-to-b from-purple-50/10 to-purple-100 border-l-2 border-purple-100">
        <AppOrbitImage />
      </div>
    </div>
  )
}
