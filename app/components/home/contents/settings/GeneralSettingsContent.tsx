import { Switch } from '@/app/components/ui/switch'

export default function GeneralSettingsContent() {
  return (
    <div className="space-y-8">
      <div>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Privacy Mode</div>
              <div className="text-xs text-gray-600 mt-1">
                Do not share dictation data to automatically improve Ito's performance.
              </div>
            </div>
            <Switch defaultChecked />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Launch at Login</div>
              <div className="text-xs text-gray-600 mt-1">
                Open Ito automatically when your computer starts.
              </div>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Show Ito bar at all times</div>
              <div className="text-xs text-gray-600 mt-1">
                Show the Ito bar at all times.
              </div>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Show app in dock</div>
              <div className="text-xs text-gray-600 mt-1">
                Show the Ito app in the dock for quick access.
              </div>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </div>
    </div>
  )
} 