import { useSettingsStore } from '@/app/store/useSettingsStore'
import { ItoMode } from '@/app/generated/ito_pb'
import MultiShortcutEditor from '@/app/components/ui/multi-shortcut-editor'

export default function KeyboardSettingsContent() {
  const { getItoModeShortcuts } = useSettingsStore()
  const transcribeShortcuts = getItoModeShortcuts(ItoMode.TRANSCRIBE)
  const editShortcuts = getItoModeShortcuts(ItoMode.EDIT)

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
            <MultiShortcutEditor
              shortcuts={transcribeShortcuts}
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
            <MultiShortcutEditor
              shortcuts={editShortcuts}
              mode={ItoMode.EDIT}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
