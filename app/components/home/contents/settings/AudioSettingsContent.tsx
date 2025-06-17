import { Switch } from '@/app/components/ui/switch'

export default function AudioSettingsContent() {
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
          
          <div>
            <div className="text-sm font-medium mb-2">Input Device</div>
            <select className="w-full max-w-xs bg-white border border-gray-300 rounded-md px-3 py-2 text-sm">
              <option>Default Microphone</option>
              <option>Built-in Microphone</option>
              <option>External USB Microphone</option>
            </select>
          </div>
          
          <div>
            <div className="text-sm font-medium mb-2">Audio Quality</div>
            <select className="w-full max-w-xs bg-white border border-gray-300 rounded-md px-3 py-2 text-sm">
              <option>High (Recommended)</option>
              <option>Medium</option>
              <option>Low (Faster Processing)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
} 