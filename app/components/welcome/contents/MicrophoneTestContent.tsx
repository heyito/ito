import { Button } from '@/app/components/ui/button'
import { useEffect, useState } from 'react'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import { MicrophoneSelector } from '@/app/components/ui/microphone-selector'

function MicrophoneBars({ volume }: { volume: number }) {
  const minHeight = 0.2
  const levels = Array(12)
    .fill(0)
    .map((_, i) => {
      const threshold = (i / 12) * 0.5
      const normalizedVolume = Math.min(volume * 2.5, 1)
      return normalizedVolume > threshold ? 1 : minHeight
    })

  return (
    <div
      className="flex gap-1 py-4 px-4 items-end bg-neutral-100 rounded-md"
      style={{ height: 120 }}
    >
      {levels.map((level, i) => (
        <div
          key={i}
          className={`mx-2 h-full ${level > minHeight ? 'bg-purple-300' : 'bg-neutral-300'}`}
          style={{
            width: 18,
            borderRadius: 6,
            transition: 'height 0.18s cubic-bezier(.4,2,.6,1)',
          }}
        />
      ))}
    </div>
  )
}

export default function MicrophoneTestContent() {
  const { incrementOnboardingStep, decrementOnboardingStep } =
    useOnboardingStore()
  const { microphoneDeviceId, microphoneName, setMicrophoneDeviceId } =
    useSettingsStore()

  const [volume, setVolume] = useState(0)
  const [smoothedVolume, setSmoothedVolume] = useState(0)

  // This effect listens for volume updates from the main process
  useEffect(() => {
    const unsubscribe = window.api.on('volume-update', (newVolume: number) => {
      setVolume(newVolume)
    })

    // Cleanup the listener when the component unmounts
    return () => {
      unsubscribe()
    }
  }, []) // Runs only once on mount

  // This effect manages the "test" recording lifecycle.
  // It starts recording when a device is selected and stops when the component unmounts.
  useEffect(() => {
    if (microphoneDeviceId) {
      console.log(`Starting test recording on device: ${microphoneDeviceId}`)
      window.api.send('start-native-recording-test')
    }

    // Cleanup function: stop recording when the component unmounts or device changes
    return () => {
      console.log('Stopping test recording.')
      // Assumes your preload script exposes 'stop-native-recording'
      window.api.send('stop-native-recording')
    }
  }, [microphoneDeviceId]) // Re-runs whenever the selected microphone changes

  // Smooth the volume updates to reduce flicker
  useEffect(() => {
    const smoothing = 0.4 // Lower = smoother, higher = more responsive
    setSmoothedVolume(prev => prev * (1 - smoothing) + volume * smoothing)
  }, [volume])

  // Handles changing the microphone
  const handleMicrophoneChange = async (deviceId: string, name: string) => {
    // The useEffect hook above will automatically handle stopping the old
    // stream and starting the new one when the deviceId changes.
    setMicrophoneDeviceId(deviceId, name)
  }

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start px-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12 overflow-hidden">
          <div className="mt-8">
            <button
              className="mb-4 text-sm text-muted-foreground hover:underline"
              type="button"
              onClick={decrementOnboardingStep}
            >
              &lt; Back
            </button>
            <h1 className="text-3xl mb-4 mt-12">
              Speak to test your microphone
            </h1>
            <div className="text-base text-muted-foreground mb-8 max-w-md">
              Your computer's built-in mic will ensure accurate transcription
              with minimal latency
            </div>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-gradient-to-b from-purple-50/10 to-purple-100 border-l-2 border-purple-100">
        <div
          className="bg-white rounded-xl shadow-lg p-6 flex flex-col items-center"
          style={{ minWidth: 500, maxHeight: 280 }}
        >
          <div className="text-lg font-medium mb-6 text-center">
            Do you see purple bars moving while you speak?
          </div>
          <MicrophoneBars volume={smoothedVolume} />
          <div className="flex gap-2 mt-6 w-full justify-end">
            <MicrophoneSelector
              selectedDeviceId={microphoneDeviceId}
              selectedMicrophoneName={microphoneName}
              onSelectionChange={handleMicrophoneChange}
              triggerButtonText="No, change microphone"
              triggerButtonVariant="outline"
              triggerButtonClassName="w-44"
            />
            <Button
              className="w-16"
              type="button"
              onClick={incrementOnboardingStep}
            >
              Yes
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
