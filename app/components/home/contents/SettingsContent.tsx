import { useMainStore } from '@/app/store/useMainStore'
import GeneralSettingsContent from './settings/GeneralSettingsContent'
import AudioSettingsContent from './settings/AudioSettingsContent'
import AccountSettingsContent from './settings/AccountSettingsContent'

export default function SettingsContent() {
  const { settingsPage, setSettingsPage } = useMainStore()

  const settingsMenuItems = [
    { id: 'general', label: 'General', active: settingsPage === 'general' },
    { id: 'audio', label: 'Audio & Mic', active: settingsPage === 'audio' },
    { id: 'account', label: 'Account', active: settingsPage === 'account' },
  ]

  const renderSettingsContent = () => {
    switch (settingsPage) {
      case 'general':
        return <GeneralSettingsContent />
      case 'audio':
        return <AudioSettingsContent />
      case 'account':
        return <AccountSettingsContent />
      default:
        return <GeneralSettingsContent />
    }
  }

  return (
    <div className="w-full px-8">
      <div className="flex gap-8">
        {/* Left Sidebar Menu */}
        <div className="w-48">
          <div className="space-y-1">
            {settingsMenuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSettingsPage(item.id as any)}
                className={`w-full text-left px-4 py-2.5 rounded text-sm font-medium transition-colors ${
                  item.active
                    ? 'bg-slate-200'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Right Content Area */}
        <div className="flex-1">
          {renderSettingsContent()}
        </div>
      </div>
    </div>
  )
} 