import { Switch } from '@/app/components/ui/switch'
import { MicrophoneSelector } from '@/app/components/ui/microphone-selector'
import { useSettingsStore } from '@/app/store/useSettingsStore'

export default function AudioSettingsContent() {
  const { microphoneDeviceId, setMicrophoneDeviceId } = useSettingsStore()

  return (
    <div className="space-y-8">
      <div>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Interaction Sounds</div>
              <div className="text-xs text-gray-600 mt-1">
                Play a sound when Ito starts and stops recording.
              </div>
            </div>
            <Switch defaultChecked />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Mute audio when dictating</div>
              <div className="text-xs text-gray-600 mt-1">
              Automatically silence other active audio during dictation.
              </div>
            </div>
            <Switch />
          </div>
          
          <div className="flex justify-between">
            <div>
              <div className="text-sm font-medium mb-2">Select default microphone</div>
              <div className="text-xs text-gray-600 mt-1">
                Select the microphone Ito will use by default for audio input.
              </div>
            </div>
            <MicrophoneSelector
              selectedDeviceId={microphoneDeviceId}
              onSelectionChange={setMicrophoneDeviceId}
              triggerButtonVariant="outline"
              triggerButtonClassName=""
            />
          </div>
        </div>
      </div>
    </div>
  )
} 