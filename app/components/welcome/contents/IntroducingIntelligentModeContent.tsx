import { Button } from '@/app/components/ui/button'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { CheckCircle } from '@mynaui/icons-react'
import { ArrowRight } from 'lucide-react'
import KeyboardShortcutEditor from '../../ui/keyboard-shortcut-editor'
import { ItoMode } from '@/app/generated/ito_pb'
import { Tip } from '../../ui/tip'
import { useSettingsStore } from '@/app/store/useSettingsStore'

export default function IntroducingIntelligentMode() {
  const { incrementOnboardingStep, decrementOnboardingStep } =
    useOnboardingStore()

  const { getItoModeShortcuts, updateKeyboardShortcut } = useSettingsStore()
  const keyboardShortcut = getItoModeShortcuts(ItoMode.EDIT)[0]

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
            <div className="text-2xl mb-1 font-medium">
              Introducing Ito Intelligent Mode
            </div>
            <div className="mb-4 text-lg font-light">
              What you ask gets written.
            </div>
            {[
              'Press Hotkey -> Speak to Ito',
              'Ito send your speech to LLM',
              'Pastes LLM output into text box',
            ].map((step, index) => (
              <div
                key={index}
                className="flex items-center gap-2 text-base font-light mb-1"
              >
                <CheckCircle />
                {step}
              </div>
            ))}
            <div className="text-lg font-semibold mt-6 mb-1">Examples</div>
            {[
              "Write an email to Jeff confirming tomorrow's meeting",
              'Write a detailed prompt to create a picture of a tall New York building',
              'Write a detailed prompt to create a stunning landing page for a dictation app',
            ].map((step, index) => (
              <div
                key={index}
                className="flex items-center gap-2 text-base font-light mb-1 italic"
              >
                <ArrowRight className="h-5 w-5 shrink-0 text-black" />
                {step}
              </div>
            ))}
            <Tip
              tipText="You can also trigger Intelligent Mode by saying 'Hey Ito' when using the regular dictation hotkey."
              className="mt-3"
            />
          </div>

          <div className="flex flex-col items-start mb-8">
            <Button className="w-24" onClick={incrementOnboardingStep}>
              Continue
            </Button>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-gradient-to-b from-purple-50/10 to-purple-100 border-l-2 border-purple-100">
        <KeyboardShortcutEditor
          shortcut={keyboardShortcut}
          onShortcutChange={updateKeyboardShortcut}
          keySize={80}
          editButtonText="Change Shortcut"
          showConfirmButton={true}
          onConfirm={incrementOnboardingStep}
          editModeTitle="Press a key to add it to the shortcut, press it again to remove it"
          viewModeTitle="Default Hotkey to activate Intelligent Mode"
          minHeight={112}
          editButtonClassName="w-44"
          confirmButtonClassName="hidden"
          className="rounded-xl shadow-lg p-6 flex flex-col items-center min-w-[500px] max-h-[280px]"
          mode={ItoMode.EDIT}
        />
      </div>
    </div>
  )
}
