import { useWindowContext } from './WindowContext'
import React, { useState, useEffect } from 'react'
import { OnboardingTitlebar } from './OnboardingTitlebar'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { UserCircle, PanelLeft, CogFour, Logout } from '@mynaui/icons-react'
import { useMainStore } from '@/app/store/useMainStore'
import { useAuthStore } from '@/app/store/useAuthStore'
import { useAuth } from '@/app/components/auth/useAuth'

export const Titlebar = () => {
  const { onboardingCompleted } = useOnboardingStore()
  const { isAuthenticated } = useAuthStore()
  const showOnboarding = !onboardingCompleted || !isAuthenticated
  const { toggleNavExpanded, setCurrentPage, setSettingsPage, navExpanded } =
    useMainStore()
  const { logoutUser } = useAuth()
  const wcontext = useWindowContext().window
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)
  const [isUpdateDownloaded, setUpdateDownloaded] = useState(false)

  // Handle clicks outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = () => {
      setShowUserDropdown(false)
    }

    if (showUserDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }

    return () => {}
  }, [showUserDropdown])

  useEffect(() => {
    // Check current update status on mount
    window.api.updater.getUpdateStatus().then(status => {
      if (status.updateAvailable) {
        setIsUpdateAvailable(true)
      }
      if (status.updateDownloaded) {
        setUpdateDownloaded(true)
      }
    })

    // Listen for future update events
    window.api.updater.onUpdateAvailable(() => {
      setIsUpdateAvailable(true)
    })

    window.api.updater.onUpdateDownloaded(() => {
      setUpdateDownloaded(true)
    })
  }, [])

  const toggleUserDropdown = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowUserDropdown(!showUserDropdown)
  }

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentPage('settings')
    setSettingsPage('account')
    setShowUserDropdown(false)
  }

  const handleSignOutClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await logoutUser()
    } catch (error) {
      console.error('Logout failed:', error)
    }
    setShowUserDropdown(false)
  }

  // Inline style override for onboarding completed
  const style: React.CSSProperties = onboardingCompleted
    ? {
        position: 'relative' as const,
        borderBottom: 'none',
      }
    : { position: 'relative' as const }

  return (
    <div
      className={`window-titlebar ${wcontext?.platform ? `platform-${wcontext.platform}` : ''}`}
      style={style}
    >
      {!showOnboarding && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            zIndex: 10,
          }}
        >
          <div
            className={`h-full border-r border-neutral-200 transition-all duration-100 ease-in-out ${navExpanded ? 'w-48' : 'w-20'}`}
          ></div>
          <div
            className="titlebar-action-btn hover:bg-slate-200 border-l border-neutral-200 ml-2"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 30,
              border: 'none',
              cursor: 'pointer',
              borderRadius: 6,
              padding: 0,
            }}
            aria-label="Open Panel"
            tabIndex={0}
            onClick={toggleNavExpanded}
          >
            <PanelLeft style={{ width: 20, height: 20 }} />
          </div>
        </div>
      )}

      {showOnboarding && <OnboardingTitlebar />}
      {wcontext?.platform === 'win32' && <TitlebarControls />}

      {!showOnboarding && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            zIndex: 10,
          }}
        >
          {isUpdateAvailable && (
            <button
              className={`titlebar-action-btn bg-sky-800 text-white px-3 py-1 rounded-md font-semibold ${
                isUpdateDownloaded
                  ? 'hover:bg-sky-700 cursor-pointer'
                  : 'cursor-not-allowed opacity-70'
              }`}
              disabled={!isUpdateDownloaded}
              onClick={() => {
                if (
                  confirm(
                    'Are you sure you want to install the update? The app will restart.',
                  )
                ) {
                  window.api.updater.installUpdate()
                }
              }}
            >
              {isUpdateDownloaded ? 'Install Update' : 'Downloading Update...'}
            </button>
          )}
          <div className="relative">
            <div
              className="titlebar-action-btn hover:bg-slate-200"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 30,
                border: 'none',
                cursor: 'pointer',
                borderRadius: 6,
                padding: 0,
                marginRight: 12,
              }}
              aria-label="Account"
              tabIndex={0}
              onClick={toggleUserDropdown}
            >
              <UserCircle style={{ width: 20, height: 20 }} />
            </div>

            {/* User Dropdown Menu */}
            {showUserDropdown && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                <button
                  onClick={handleSettingsClick}
                  className="w-full px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-t-lg cursor-pointer"
                >
                  <CogFour className="w-4 h-4" />
                  Settings
                </button>
                <button
                  onClick={handleSignOutClick}
                  className="w-full px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-b-lg cursor-pointer"
                >
                  <Logout className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const TitlebarControls = () => {
  const closePath =
    'M 0,0 0,0.7 4.3,5 0,9.3 0,10 0.7,10 5,5.7 9.3,10 10,10 10,9.3 5.7,5 10,0.7 10,0 9.3,0 5,4.3 0.7,0 Z'
  const maximizePath = 'M 0,0 0,10 10,10 10,0 Z M 1,1 9,1 9,9 1,9 Z'
  const minimizePath = 'M 0,5 10,5 10,6 0,6 Z'
  const wcontext = useWindowContext().window

  return (
    <div className="window-titlebar-controls">
      <TitlebarControlButton label="close" svgPath={closePath} />
      {wcontext?.maximizable && (
        <TitlebarControlButton label="maximize" svgPath={maximizePath} />
      )}
      {wcontext?.minimizable && (
        <TitlebarControlButton label="minimize" svgPath={minimizePath} />
      )}
    </div>
  )
}

const TitlebarControlButton = ({
  svgPath,
  label,
}: {
  svgPath: string
  label: string
}) => {
  const handleAction = () => {
    switch (label) {
      case 'minimize':
        window.api.invoke('window-minimize')
        break
      case 'maximize':
        window.api.invoke('window-maximize-toggle')
        break
      case 'close':
        window.api.invoke('window-close')
        break
      default:
        console.warn(`Unhandled action for label: ${label}`)
    }
  }

  return (
    <div
      aria-label={label}
      className="titlebar-controlButton"
      onClick={handleAction}
    >
      <svg width="10" height="10">
        <path fill="currentColor" d={svgPath} />
      </svg>
    </div>
  )
}

export interface TitlebarProps {
  title: string
  titleCentered?: boolean
  icon?: string
}
