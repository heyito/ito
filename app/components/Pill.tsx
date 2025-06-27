import React, { useState, useEffect } from 'react'
import { useSettingsStore } from '../store/useSettingsStore'

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
  }
`

const BAR_UPDATE_INTERVAL = 48

// A new component to very basic audio visualization using canvas
const AudioBars = ({ volumeHistory }: { volumeHistory: number[] }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [activeBarIndex, setActiveBarIndex] = useState(0)

  const barCount = 42
  const barWidth = 1.5
  const barSpacing = 0

  useEffect(() => {
    setActiveBarIndex(prevIndex => (prevIndex + 1) % barCount)
  }, [volumeHistory])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas dimensions with device pixel ratio for crisp rendering
    const devicePixelRatio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * devicePixelRatio
    canvas.height = rect.height * devicePixelRatio
    ctx.scale(devicePixelRatio, devicePixelRatio)

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height)

    // Calculate total width needed for all bars
    const totalBarsWidth = barCount * barWidth + (barCount - 1) * barSpacing
    const startX = (rect.width - totalBarsWidth) / 2

    // Draw bars
    ctx.fillStyle = 'white'

    for (let i = 0; i < barCount; i++) {
      const volume = volumeHistory[volumeHistory.length - i - 1] || 0
      const scale = Math.max(0.05, Math.min(1, volume * 10))
      const activeBarHeight = i === activeBarIndex ? 2 : 0
      const height = activeBarHeight + 1 * 20 * scale
      const clampedHeight = Math.min(Math.max(height, 1), 18)

      const x = startX + i * (barWidth + barSpacing)
      const y = (rect.height - clampedHeight) / 2

      // Draw rounded rectangle for each bar
      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, clampedHeight, 1.25)
      ctx.fill()
    }
  }, [volumeHistory, activeBarIndex, barCount])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
      }}
    />
  )
}

const Pill = () => {
  // Get initial value from store
  const initialShowItoBarAlways = useSettingsStore(
    state => state.showItoBarAlways,
  )

  const [isRecording, setIsRecording] = useState(false)
  const [showItoBarAlways, setShowItoBarAlways] = useState(
    initialShowItoBarAlways,
  )
  // Fixed size array of volume values to be used for the audio bars, size is 21
  const [volumeHistory, setVolumeHistory] = useState<number[]>([])
  const [lastVolumeUpdate, setLastVolumeUpdate] = useState(0)

  useEffect(() => {
    // Listen for recording state changes from the main process
    const unsubRecording = window.api.on(
      'recording-state-update',
      (state: { isRecording: boolean }) => {
        // No longer need to ask main to resize. Just update React state.
        setIsRecording(state.isRecording)
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
    })

    // Cleanup listeners when the component unmounts
    return () => {
      unsubRecording()
      unsubVolume()
      unsubSettings()
    }
  }, [volumeHistory, lastVolumeUpdate]) // Dependency array is empty as the logic inside doesn't depend on state.

  // Define dimensions for both states
  const idleWidth = 60
  const idleHeight = 8
  const recordingWidth = 96
  const recordingHeight = 36
  console.log('showItoBarAlways', showItoBarAlways)
  console.log('isRecording', isRecording)

  // A single, unified style for the pill. Its properties will be
  // smoothly transitioned by CSS.
  const pillStyle: React.CSSProperties = {
    // Flex properties to center the audio bars inside
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',

    // Dynamic styles that change based on the recording state
    width: isRecording ? `${recordingWidth}px` : `${idleWidth}px`,
    height: isRecording ? `${recordingHeight}px` : `${idleHeight}px`,
    backgroundColor: isRecording ? '#000000' : '#808080',
    border: '1px solid #A9A9A9',

    // Show/hide animation using opacity and scale instead of display none/flex
    opacity: isRecording || showItoBarAlways ? 1 : 0,
    transform: isRecording || showItoBarAlways ? 'scale(1)' : 'scale(0.8)',
    visibility: isRecording || showItoBarAlways ? 'visible' : 'hidden',

    // Static styles
    borderRadius: '21px',
    boxSizing: 'border-box',
    overflow: 'hidden',

    // The transition property makes the magic happen!
    // We animate width, height, color, opacity, and scale changes over 0.3 seconds.
    transition:
      'width 0.3s ease, height 0.3s ease, background-color 0.3s ease, opacity 0.3s ease, transform 0.3s ease, visibility 0.3s ease',
  }

  return (
    <>
      <style>{globalStyles}</style>
      <div style={pillStyle}>
        {/* Conditionally render the audio bars. They will fade in as the
            pill expands because they are part of the content. */}
        {isRecording && <AudioBars volumeHistory={volumeHistory} />}
      </div>
    </>
  )
}

export default Pill
