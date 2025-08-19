import { useSettingsStore } from '@/app/store/useSettingsStore'
import KeyboardShortcutEditor from '@/app/components/ui/keyboard-shortcut-editor'
import { ItoMode } from '@/app/generated/ito_pb'

export default function KeyboardSettingsContent() {
  const { getItoModeShortcut, addKeyboardShortcut } = useSettingsStore()
  const transcribeShortcut = getItoModeShortcut(ItoMode.TRANSCRIBE)
  const editShortcut = getItoModeShortcut(ItoMode.EDIT)

  return (
    <div className="space-y-8">
      <div>
        <div className="space-y-6">
          <div className="flex gap-4 justify-between">
            <div className="w-1/3">
              <div className="text-sm font-medium mb-2">Keyboard Shortcut</div>
              <div className="text-xs text-gray-600 mb-4">
                Set the keyboard shortcut to activate Ito. Press the keys you
                want to use for your shortcut.
              </div>
            </div>
            <KeyboardShortcutEditor
              shortcut={transcribeShortcut}
              onShortcutChange={addKeyboardShortcut}
              hideTitle={true}
              className="w-1/2"
              mode={ItoMode.TRANSCRIBE}
            />
          </div>
          <div className="flex gap-4 justify-between">
            <div className="w-1/3">
              <div className="text-sm font-medium mb-2">
                Intelligent Mode Shortcut
              </div>
              <div className="text-xs text-gray-600 mb-4">
                Set the shortcut to activate Intelligent Mode. Press your
                hotkey, speak to Ito, and the LLM's output is pasted into your
                text box.
              </div>
            </div>
            <KeyboardShortcutEditor
              shortcut={editShortcut}
              onShortcutChange={addKeyboardShortcut}
              hideTitle={true}
              className="w-1/2"
              mode={ItoMode.EDIT}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
