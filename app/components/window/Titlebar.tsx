import { useEffect } from 'react'
import { useWindowContext } from './WindowContext'
import { useTitlebarContext } from './TitlebarContext'
import { TitlebarMenu } from './TitlebarMenu'
import React from 'react'

export const Titlebar = () => {
  const { title, icon, titleCentered, menuItems } = useWindowContext().titlebar
  const { menusVisible, setMenusVisible, closeActiveMenu } = useTitlebarContext()
  const wcontext = useWindowContext().window

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && menuItems?.length) {
        // Ignore repeated keydown events
        if (e.repeat) return
        // Close active menu if it's open
        if (menusVisible) closeActiveMenu()
        setMenusVisible(!menusVisible)
      }
    }

    // Add event listener for Alt key
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menusVisible, closeActiveMenu, setMenusVisible, menuItems])

  return (
    <div className={`window-titlebar ${wcontext?.platform ? `platform-${wcontext.platform}` : ''}`}
         style={{ position: 'relative' }}>
      {wcontext?.platform === 'win32' && (
        <div className="window-titlebar-icon">
          <img src={icon} />
        </div>
      )}

      {/* <div
        className="window-titlebar-title"
        {...(titleCentered && { 'data-centered': true })}
        style={{ visibility: menusVisible ? 'hidden' : 'visible' }}
      >
        {title}
      </div> */}
      {/* Onboarding Steps Text */}
      <div className="onboarding-steps-text">
        {['Sign Up', 'Permissions', 'Set Up', 'Try it'].map((step, idx, arr) => (
          <React.Fragment key={step}>
            <span className={`onboarding-step-label${idx === 0 ? ' active' : ''}`}>{step.toUpperCase()}</span>
            {idx < arr.length - 1 && (
              <span className="onboarding-step-chevron" aria-hidden="true">&#8250;</span>
            )}
          </React.Fragment>
        ))}
      </div>
      {menusVisible && <TitlebarMenu />}
      {wcontext?.platform === 'win32' && <TitlebarControls />}
      {/* Onboarding Progress Bar (hardcoded to 25% for now) */}
      <div className="onboarding-progress-bar-bg">
        <div className="onboarding-progress-bar-fg" />
      </div>
      <style>{`
        .onboarding-steps-text {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 2;
          font-size: 14px;
          font-weight: 500;
        }
        .onboarding-step-label {
          color: #b0b0b0;
          font-weight: 400;
          transition: color 0.2s, font-weight 0.2s;
          display: inline-flex;
          align-items: center;
          margin: 0 36px;
        }
        .onboarding-step-label.active {
          color: #222;
          font-weight: 500;
        }
        .onboarding-step-chevron {
          color: #d0d0d0;
          font-size: 24px;
          margin: 0 36px;
          margin-top: -4px;
          display: inline-flex;
          align-items: center;
        }
        .onboarding-progress-bar-bg {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 3px;
          background: #ececec;
          border-radius: 2px;
          overflow: hidden;
          pointer-events: none;
          z-index: 1;
        }
        .onboarding-progress-bar-fg {
          height: 100%;
          width: 25%; /* 1 of 4 steps */
          background: linear-gradient(90deg, #8aa6cf 0%, #43679d 100%);
          border-radius: 2px;
          transition: width 0.4s cubic-bezier(0.4,0,0.2,1);
        }
      `}</style>
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
      {wcontext?.minimizable && <TitlebarControlButton label="minimize" svgPath={minimizePath} />}
      {wcontext?.maximizable && <TitlebarControlButton label="maximize" svgPath={maximizePath} />}
      <TitlebarControlButton label="close" svgPath={closePath} />
    </div>
  )
}

const TitlebarControlButton = ({ svgPath, label }: { svgPath: string; label: string }) => {
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
    <div aria-label={label} className="titlebar-controlButton" onClick={handleAction}>
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
  menuItems?: TitlebarMenu[]
}
