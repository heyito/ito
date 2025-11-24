import { useState } from 'react'
import { Switch } from '@/app/components/ui/switch'
import { Button } from '@/app/components/ui/button'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import { useWindowContext } from '@/app/components/window/WindowContext'

export default function GeneralSettingsContent() {
  const [isDownloading, setIsDownloading] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const {
    shareAnalytics,
    launchAtLogin,
    showItoBarAlways,
    showAppInDock,
    setShareAnalytics,
    setLaunchAtLogin,
    setShowItoBarAlways,
    setShowAppInDock,
  } = useSettingsStore()

  const windowContext = useWindowContext()

  const handleDownloadLogs = async () => {
    setIsDownloading(true)
    try {
      const result = await window.api.logs.download()
      if (result.success) {
        console.log('Logs downloaded successfully to:', result.path)
      } else {
        if (result.error !== 'Download cancelled') {
          console.error('Failed to download logs:', result.error)
          alert(`Failed to download logs: ${result.error}`)
        }
      }
    } catch (error) {
      console.error('Error downloading logs:', error)
      alert('An unexpected error occurred while downloading logs')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleClearLogs = async () => {
    const confirmed = confirm(
      'Are you sure you want to clear all logs? This action cannot be undone.',
    )
    if (!confirmed) return

    setIsClearing(true)
    try {
      const result = await window.api.logs.clear()
      if (result.success) {
        console.log('Logs cleared successfully')
        alert('Logs cleared successfully')
      } else {
        console.error('Failed to clear logs:', result.error)
        alert(`Failed to clear logs: ${result.error}`)
      }
    } catch (error) {
      console.error('Error clearing logs:', error)
      alert('An unexpected error occurred while clearing logs')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Share analytics</div>
              <div className="text-xs text-gray-600 mt-1">
                Share anonymous usage data to help us improve Ito.
              </div>
            </div>
            <Switch
              checked={shareAnalytics}
              onCheckedChange={setShareAnalytics}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Launch at Login</div>
              <div className="text-xs text-gray-600 mt-1">
                Open Ito automatically when your computer starts.
              </div>
            </div>
            <Switch
              checked={launchAtLogin}
              onCheckedChange={setLaunchAtLogin}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">
                Show Ito bar at all times
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Show the Ito bar at all times.
              </div>
            </div>
            <Switch
              checked={showItoBarAlways}
              onCheckedChange={setShowItoBarAlways}
            />
          </div>

          {windowContext?.window?.platform === 'darwin' && (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Show app in dock</div>
                <div className="text-xs text-gray-600 mt-1">
                  Show the Ito app in the dock for quick access.
                </div>
              </div>
              <Switch
                checked={showAppInDock}
                onCheckedChange={setShowAppInDock}
              />
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="text-lg font-medium mb-4">Log Management</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Download Logs</div>
              <div className="text-xs text-gray-600 mt-1">
                Export your local logs to a file for troubleshooting.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadLogs}
              disabled={isDownloading}
            >
              {isDownloading ? 'Downloading...' : 'Download'}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Clear Logs</div>
              <div className="text-xs text-gray-600 mt-1">
                Permanently delete all local logs from your device.
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearLogs}
              disabled={isClearing}
            >
              {isClearing ? 'Clearing...' : 'Clear'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
