import { Button } from '@/app/components/ui/button'
import { CheckCircle, Lock } from '@mynaui/icons-react'
import { EXTERNAL_LINKS } from '@/lib/constants/external-links'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { useSettingsStore } from '@/app/store/useSettingsStore'

export default function DataControlContent() {
  const { incrementOnboardingStep, decrementOnboardingStep } =
    useOnboardingStore()
  const { shareAnalytics, setShareAnalytics } = useSettingsStore()

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start pl-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12">
          <div className="mt-8">
            <button
              className="mb-4 text-sm text-muted-foreground hover:underline"
              type="button"
              onClick={decrementOnboardingStep}
            >
              &lt; Back
            </button>
            <h1 className="text-3xl mb-4 mt-12">You control your data.</h1>
            <div className="flex flex-col gap-4 my-8 pr-24">
              <div
                className={`border rounded-lg p-4 cursor-pointer transition-all ${shareAnalytics ? 'border-green-200 bg-green-50 border-2' : 'border-border border-2 bg-background'}`}
                onClick={() => setShareAnalytics(true)}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="font-medium">Help improve Ito</div>
                  {shareAnalytics && (
                    <div>
                      <CheckCircle
                        style={{ color: '#22c55e', width: 18, height: 18 }}
                      />
                    </div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground max-w-md mt-1">
                  To make Ito better, this option lets us collect your audio,
                  transcript, and edits to evaluate, train and improve Ito's
                  features and AI models.
                </div>
              </div>
              <div
                className={`border rounded-lg p-4 cursor-pointer transition-all ${!shareAnalytics ? 'border-purple-200 bg-purple-50 border-2' : 'border-border border-2 bg-background'}`}
                onClick={() => setShareAnalytics(false)}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="font-medium">Privacy Mode</div>
                  {!shareAnalytics && (
                    <div>
                      <Lock
                        style={{ color: '#a78bfa', width: 18, height: 18 }}
                      />
                    </div>
                  )}
                </div>
                <div className="text-muted-foreground max-w-md mt-1">
                  If you enable Privacy Mode, none of your dictation data will
                  be stored or used for model training by us or any third party.
                </div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              You can always change this later in settings.{' '}
              <button
                onClick={() =>
                  window.api?.invoke(
                    'web-open-url',
                    EXTERNAL_LINKS.PRIVACY_POLICY,
                  )
                }
                className="underline hover:text-foreground cursor-pointer"
              >
                Read more here.
              </button>
            </div>
          </div>
          <div className="flex flex-col items-start mb-8">
            <Button className="w-24" onClick={incrementOnboardingStep}>
              Continue
            </Button>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-gradient-to-b from-purple-50/10 to-purple-100 border-l-2 border-purple-100">
        <Lock style={{ width: 220, height: 220, color: '#c4b5fd' }} />
      </div>
    </div>
  )
}
