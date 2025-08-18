import { useSettingsStore } from '@/app/store/useSettingsStore'
import KeyboardShortcutEditor from '@/app/components/ui/keyboard-shortcut-editor'

export default function KeyboardSettingsContent() {
  const { getTranscribeShortcut, addKeyboardShortcut } = useSettingsStore()
  const keyboardShortcut = getTranscribeShortcut

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
              shortcut={keyboardShortcut}
              onShortcutChange={addKeyboardShortcut}
              hideTitle={true}
              className="w-1/2"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
