import React, { useState, useEffect } from 'react'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { X, StopSquare } from '@mynaui/icons-react'
import { AudioBars } from './contents/AudioBars'
import { PreviewAudioBars } from './contents/PreviewAudioBars'
import { useAudioStore } from '@/app/store/useAudioStore'
import { TooltipButton } from './contents/TooltipButton'

const globalStyles = `
  html, body, #app {
    height: 100%;
    margin: 0;
    overflow: hidden; /* Prevent scrollbars */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;

    /* These styles are key to anchoring the pill to the bottom center */
    /* of its transparent window, allowing it to expand upwards. */
    display: flex;
    align-items: flex-end;
    justify-content: center;

    pointer-events: none;
  }
`

const BAR_UPDATE_INTERVAL = 48

const Pill = () => {
  // Get initial values from store using separate selectors to avoid infinite re-renders
  const initialShowItoBarAlways = useSettingsStore(
    state => state.showItoBarAlways,
  )
  const initialMicrophoneDeviceId = useSettingsStore(
    state => state.microphoneDeviceId,
  )
  const { startRecording, stopRecording } = useAudioStore()

  const [isRecording, setIsRecording] = useState(false)
  const [isManualRecording, setIsManualRecording] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [showItoBarAlways, setShowItoBarAlways] = useState(
    initialShowItoBarAlways,
  )
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState(
    initialMicrophoneDeviceId,
  )
  // Fixed size array of volume values to be used for the audio bars, size is 21
  const [volumeHistory, setVolumeHistory] = useState<number[]>([])
  const [lastVolumeUpdate, setLastVolumeUpdate] = useState(0)

  useEffect(() => {
    // Listen for recording state changes from the main process
    const unsubRecording = window.api.on(
      'recording-state-update',
      (state: { isRecording: boolean }) => {
        // Update recording state - this is for global hotkey triggered recording
        setIsRecording(state.isRecording)
        // If global recording stops, also stop manual recording
        if (!state.isRecording) {
          setIsManualRecording(false)
        }
        setVolumeHistory([])
      },
    )

    // Listen for volume updates from the main process
    const unsubVolume = window.api.on('volume-update', (vol: number) => {
      // throttle the volume updates to 80ms
      const now = Date.now()
      if (now - lastVolumeUpdate < BAR_UPDATE_INTERVAL) {
        return
      }
      const newVolumeHistory = [...volumeHistory, vol]
      if (newVolumeHistory.length > 42) {
        newVolumeHistory.shift()
      }
      setVolumeHistory(newVolumeHistory)
      setLastVolumeUpdate(now)
    })

    // Listen for settings updates from the main process
    const unsubSettings = window.api.on('settings-update', (settings: any) => {
      // Update local state with the new setting
      setShowItoBarAlways(settings.showItoBarAlways)
      setMicrophoneDeviceId(settings.microphoneDeviceId)
    })

    // Cleanup listeners when the component unmounts
    return () => {
      unsubRecording()
      unsubVolume()
      unsubSettings()
    }
  }, [volumeHistory, lastVolumeUpdate]) // Dependency array is empty as the logic inside doesn't depend on state.

  // Define dimensions for different states
  const idleWidth = 36
  const idleHeight = 8
  const hoveredWidth = 84
  const hoveredHeight = 32
  const recordingWidth = 84
  const recordingHeight = 32
  const manualRecordingWidth = 112
  const manualRecordingHeight = 32

  // Determine current state
  const anyRecording = isRecording || isManualRecording
  const shouldShow = anyRecording || showItoBarAlways || isHovered

  // Calculate dimensions based on state
  let currentWidth = idleWidth
  let currentHeight = idleHeight
  let backgroundColor = '#808080'

  if (isManualRecording) {
    currentWidth = manualRecordingWidth
    currentHeight = manualRecordingHeight
    backgroundColor = '#000000'
  } else if (anyRecording) {
    currentWidth = recordingWidth
    currentHeight = recordingHeight
    backgroundColor = '#000000'
  } else if (isHovered) {
    currentWidth = hoveredWidth
    currentHeight = hoveredHeight
    backgroundColor = '#404040'
  }

  // A single, unified style for the pill. Its properties will be
  // smoothly transitioned by CSS.
  const pillStyle: React.CSSProperties = {
    // Flex properties to center the content inside
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',

    // Dynamic styles that change based on the state
    width: `${currentWidth}px`,
    height: `${currentHeight}px`,
    backgroundColor,
    border: '1px solid #A9A9A9',

    // Show/hide animation using opacity and scale instead of display none/flex
    opacity: shouldShow ? 1 : 0,
    transform: shouldShow ? 'scale(1)' : 'scale(0.8)',
    visibility: shouldShow ? 'visible' : 'hidden',

    // Static styles
    borderRadius: '21px',
    boxSizing: 'border-box',
    overflow: 'hidden',

    // Enable pointer events for this element
    pointerEvents: 'auto',
    cursor: isHovered && !anyRecording ? 'pointer' : 'default',

    // The transition property makes the magic happen!
    // We animate width, height, color, opacity, and scale changes over 0.3 seconds.
    transition:
      'width 0.3s ease, height 0.3s ease, background-color 0.3s ease, opacity 0.3s ease, transform 0.3s ease, visibility 0.3s ease',
  }

  // Handle mouse enter - enable mouse events for the pill window and set hover state
  const handleMouseEnter = () => {
    setIsHovered(true)
    if (window.api?.setPillMouseEvents) {
      window.api.setPillMouseEvents(false) // Enable mouse events
    }
  }

  // Handle mouse leave - disable mouse events (with forwarding) for the pill window and clear hover state
  const handleMouseLeave = () => {
    setIsHovered(false)
    if (window.api?.setPillMouseEvents) {
      window.api.setPillMouseEvents(true, { forward: true }) // Disable mouse events but keep forwarding
    }
  }

  // Handle click to start manual recording
  const handleClick = () => {
    if (isHovered && !anyRecording) {
      setIsManualRecording(true)
      // Trigger recording start via IPC
      startRecording(microphoneDeviceId)
    }
  }

  // Handle cancel recording
  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsManualRecording(false)
    stopRecording()
  }

  // Handle stop recording
  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsManualRecording(false)
    stopRecording()
  }

  const renderContent = () => {
    if (isManualRecording) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            justifyContent: 'space-between',
            padding: '0 8px',
          }}
        >
          <TooltipButton
            onClick={handleCancel}
            icon={<X width={14} height={14} color="white" />}
            tooltip="Cancel"
          />

          <AudioBars volumeHistory={volumeHistory} />

          <TooltipButton
            onClick={handleStop}
            icon={<StopSquare width={14} height={14} color="#ef4444" />}
            tooltip="Stop and paste"
          />
        </div>
      )
    }

    if (anyRecording) {
      return <AudioBars volumeHistory={volumeHistory} />
    }

    if (isHovered) {
      return <PreviewAudioBars />
    }

    return null
  }

  return (
    <>
      <style>{globalStyles}</style>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            style={pillStyle}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {renderContent()}
          </div>
        </TooltipTrigger>
        {isHovered && !anyRecording && (
          <TooltipContent
            side="top"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              padding: '6px 8px',
              fontSize: '14px',
              marginBottom: '6px',
            }}
            className="border-none rounded-md"
          >
            Click and start speaking
          </TooltipContent>
        )}
      </Tooltip>
    </>
  )
}

export default Pill
