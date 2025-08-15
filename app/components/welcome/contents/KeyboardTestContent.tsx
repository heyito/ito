import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import KeyboardShortcutEditor from '../../ui/keyboard-shortcut-editor'

export default function KeyboardTestContent() {
  const { incrementOnboardingStep, decrementOnboardingStep } =
    useOnboardingStore()
  const { getTranscribeShortcut, addKeyboardShortcut } = useSettingsStore()
  const keyboardShortcut = getTranscribeShortcut()

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start px-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12 overflow-hidden">
          <div className="mt-8">
            <button
              className="mb-4 text-sm text-muted-foreground hover:underline"
              type="button"
              onClick={decrementOnboardingStep}
            >
              &lt; Back
            </button>
            <h1 className="text-3xl mb-4 mt-12">
              Press the keyboard shortcut to test it out.
            </h1>
            <div className="text-base text-muted-foreground mb-8 max-w-md">
              We recommend the{''}
              <span className="inline-flex items-center px-2 py-0.5 bg-neutral-100 border rounded text-xs font-mono ml-1">
                fn
              </span>{' '}
              key at the bottom left of the keyboard
            </div>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-gradient-to-b from-purple-50/10 to-purple-100 border-l-2 border-purple-100">
        <KeyboardShortcutEditor
          shortcut={keyboardShortcut}
          onShortcutChange={addKeyboardShortcut}
          keySize={80}
          editButtonText="No, change shortcut"
          confirmButtonText="Yes"
          showConfirmButton={true}
          onConfirm={incrementOnboardingStep}
          editModeTitle="Press a key to add it to the shortcut, press it again to remove it"
          viewModeTitle="Does the button turn purple while pressing it?"
          minHeight={112}
          editButtonClassName="w-44"
          confirmButtonClassName="w-16"
          className="rounded-xl shadow-lg p-6 flex flex-col items-center min-w-[500px] max-h-[280px]"
          mode="transcribe"
        />
      </div>
    </div>
  )
}
