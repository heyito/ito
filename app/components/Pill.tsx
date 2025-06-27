import React, { useState, useEffect } from 'react'

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

// A new component to very basic audio visualization
const AudioBars = ({ volumeHistory }: { volumeHistory: number[] }) => {
  // Base heights for visual variety
  const bars = Array(42).fill(1)
  const [activeBarIndex, setActiveBarIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveBarIndex(prevIndex => (prevIndex + 1) % bars.length)
    }, BAR_UPDATE_INTERVAL)

    return () => clearInterval(interval)
  }, [bars.length])

  const barStyle = (baseHeight: number, index: number): React.CSSProperties => {
    const volume = volumeHistory[volumeHistory.length - index - 1] || 0
    const scale = Math.max(0.05, Math.min(1, volume * 2.5))
    const activeBarHeight = index === activeBarIndex ? 2 : 0
    const height = activeBarHeight + baseHeight * 20 * scale
    const clampedHeight = Math.min(Math.max(height, 1), 14)

    return {
      width: '1px',
      backgroundColor: 'white',
      borderRadius: '2.5px',
      margin: '0 0.25px',
      height: `${clampedHeight}px`,
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
      }}
    >
      {bars.map((h, i) => (
        <div key={i} style={barStyle(h, i)} />
      ))}
    </div>
  )
}

const Pill = () => {
  const [isRecording, setIsRecording] = useState(false)
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

    // Cleanup listeners when the component unmounts
    return () => {
      unsubRecording()
      unsubVolume()
    }
  }, [volumeHistory, lastVolumeUpdate]) // Dependency array is empty as the logic inside doesn't depend on state.

  // Define dimensions for both states
  const idleWidth = 60
  const idleHeight = 8
  const recordingWidth = 96
  const recordingHeight = 36

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

    // Static styles
    borderRadius: '21px',
    boxSizing: 'border-box',
    overflow: 'hidden',

    // The transition property makes the magic happen!
    // We animate width, height, and color changes over 0.3 seconds.
    transition: 'width 0.3s ease, height 0.3s ease, background-color 0.3s ease',
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
