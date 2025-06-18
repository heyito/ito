import { Button } from '@/app/components/ui/button'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import {
  setupVolumeMonitoring,
  getAvailableMicrophones,
  microphoneToRender,
} from '@/lib/media/microphone'
import { MicrophoneSelector } from '@/app/components/ui/microphone-selector'

function MicrophoneBars({ volume }: { volume: number }) {
  // Each bar is either full height or min height depending on threshold
  const minHeight = 0.2
  const levels = Array(12)
    .fill(0)
    .map((_, i) => {
      const threshold = (i / 12) * 0.5
      const normalizedVolume = Math.min(volume * 1.5, 1)
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
  const {
    incrementOnboardingStep,
    decrementOnboardingStep,
  } = useOnboardingStore()
  const { microphoneDeviceId, microphoneName, setMicrophoneDeviceId } = useSettingsStore()
  const [volume, setVolume] = useState(0)
  const [smoothedVolume, setSmoothedVolume] = useState(0)
  const cleanupRef = useRef<(() => void) | null>(null)

  const initializeMicrophone = useCallback(async (deviceId: string) => {
    try {
      // Clean up previous microphone if it exists
      if (cleanupRef.current) {
        cleanupRef.current()
      }

      // Setup new microphone
      const newCleanup = await setupVolumeMonitoring(
        volume => setVolume(volume),
        deviceId,
      )
      cleanupRef.current = newCleanup
    } catch (error) {
      console.error('Failed to initialize microphone:', error)
    }
  }, [])

  // Single effect to handle both initial load and device selection
  useEffect(() => {
    let mounted = true

    const loadAndInitialize = async () => {
      try {
        const mics = await getAvailableMicrophones()

        // Only proceed if component is still mounted
        if (!mounted) {
          return
        }

        if (mics.length > 0) {
          const initialMic = mics[0]
          const initialDeviceId = initialMic.deviceId
          const initialMicName = microphoneToRender(initialMic).title
          setMicrophoneDeviceId(initialDeviceId, initialMicName)
          await initializeMicrophone(initialDeviceId)
        }
      } catch (error) {
        console.error('Failed to load microphones:', error)
      }
    }

    loadAndInitialize()

    // Cleanup on unmount
    return () => {
      mounted = false
      if (cleanupRef.current) {
        cleanupRef.current()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  // Smooth the volume updates to reduce flicker
  useEffect(() => {
    const smoothing = 0.2 // Lower = smoother, higher = more responsive
    setSmoothedVolume(prev => prev * (1 - smoothing) + volume * smoothing)
  }, [volume])

  const handleMicrophoneChange = async (deviceId: string, name: string) => {
    setMicrophoneDeviceId(deviceId, name)
    await initializeMicrophone(deviceId)
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
