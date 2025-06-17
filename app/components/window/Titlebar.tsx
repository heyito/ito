import { useWindowContext } from './WindowContext'
import React from 'react'
import { OnboardingTitlebar } from './OnboardingTitlebar'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { CogFour, UserCircle, PanelLeft } from '@mynaui/icons-react'
import { useMainStore } from '@/app/store/useMainStore'

export const Titlebar = () => {
  const { icon } = useWindowContext().titlebar
  const { onboardingCompleted } = useOnboardingStore()
  const { toggleNavExpanded } = useMainStore()
  const wcontext = useWindowContext().window

  // Inline style override for onboarding completed
  const style: React.CSSProperties = onboardingCompleted
    ? {
        position: 'relative' as const,
        backgroundColor: '#f8fafc',
        borderBottom: 'none',
      }
    : { position: 'relative' as const }

  return (
    <div
      className={`window-titlebar ${wcontext?.platform ? `platform-${wcontext.platform}` : ''}`}
      style={style}
    >
      {onboardingCompleted && (
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
            marginLeft: 100,
          }}
        >
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
            }}
            aria-label="Open Panel"
            tabIndex={0}
            onClick={toggleNavExpanded}
          >
            <PanelLeft style={{ width: 20, height: 20 }} />
          </div>
        </div>
      )}
      {wcontext?.platform === 'win32' && (
        <div
          className="window-titlebar-icon"
          style={onboardingCompleted ? { left: 36 } : {}}
        >
          <img src={icon} />
        </div>
      )}

      {!onboardingCompleted && <OnboardingTitlebar />}
      {wcontext?.platform === 'win32' && <TitlebarControls />}

      {onboardingCompleted && (
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
            }}
            aria-label="Settings"
            tabIndex={0}
          >
            <CogFour style={{ width: 20, height: 20 }} />
          </div>
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
          >
            <UserCircle style={{ width: 20, height: 20 }} />
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
      {wcontext?.minimizable && (
        <TitlebarControlButton label="minimize" svgPath={minimizePath} />
      )}
      {wcontext?.maximizable && (
        <TitlebarControlButton label="maximize" svgPath={maximizePath} />
      )}
      <TitlebarControlButton label="close" svgPath={closePath} />
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
