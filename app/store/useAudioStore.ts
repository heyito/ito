import { create } from 'zustand'
import { setupMicrophone, setupVolumeMonitoring } from '@/app/media/microphone'
import { useSettingsStore } from './useSettingsStore'

// This is a stub for your gRPC service.
// When you're ready, you can replace this with your actual gRPC client.
const grpcStub = {
  sendAudioChunk: (chunk: Blob) => {
    // In the future, this will send the audio chunk to the server.
    console.log(`[gRPC Stub] Sending audio chunk of size: ${chunk.size}`)
  },
}

interface AudioState {
  isRecording: boolean
  isBusy: boolean
  isShortcutEnabled: boolean
  mediaRecorder: MediaRecorder | null
  mediaStream: MediaStream | null
  stopVolumeMonitor: (() => void) | null // To hold the cleanup function
  setIsShortcutEnabled: (enabled: boolean) => void
  startRecording: (deviceId: string) => Promise<void>
  stopRecording: () => void
}

export const useAudioStore = create<AudioState>((set, get) => ({
  isRecording: false,
  isBusy: false,
  isShortcutEnabled: true, // The shortcut is enabled by default.
  mediaRecorder: null,
  mediaStream: null,
  stopVolumeMonitor: null, // Initialize with null

  /**
   * Enables or disables the global keyboard shortcut listener.
   * This is useful when the user is editing the shortcut in the settings.
   */
  setIsShortcutEnabled: (enabled: boolean) => {
    set({ isShortcutEnabled: enabled })
  },

  /**
   * Starts capturing audio from the selected microphone.
   */
  startRecording: async (deviceId: string) => {
    // If we're already busy starting or already recording, ignore.
    if (get().isBusy || get().isRecording) {
      return
    }

    // Acquire lock and signal intent to record.
    set({ isBusy: true, isRecording: true })

    let monitorCleanup: (() => void) | null = null
    try {
      const volumeSetup = await setupVolumeMonitoring((volume) => {
        window.api.send('volume-update', volume)
      }, deviceId)
      monitorCleanup = volumeSetup.cleanup

      // After async setup, check if the user has already released the key.
      if (!get().isRecording) {
        console.log('Recording cancelled during microphone setup.')
        monitorCleanup()
        set({ isBusy: false }) // Release lock
        return
      }

      const mediaRecorder = new MediaRecorder(volumeSetup.stream, {
        mimeType: 'audio/webm',
      })

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          grpcStub.sendAudioChunk(event.data)
        }
      }

      mediaRecorder.onstart = () => {
        console.log('MediaRecorder has started.')
        // The system is now officially recording, so we can release the busy lock.
        set({ isBusy: false })
      }

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder has stopped.')
        // The stop monitor function handles all resource cleanup.
        const currentStopMonitor = get().stopVolumeMonitor
        if (currentStopMonitor) {
          currentStopMonitor()
        }
        set({
          isRecording: false,
          isBusy: false,
          mediaRecorder: null,
          mediaStream: null,
          stopVolumeMonitor: null,
        })
      }

      // Store all resources needed for cleanup BEFORE starting.
      set({
        mediaRecorder,
        mediaStream: volumeSetup.stream,
        stopVolumeMonitor: monitorCleanup,
      })

      // Final check before starting the recorder.
      if (!get().isRecording) {
        console.log('Recording cancelled just before recorder start.')
        // Don't call stop() on a recorder that hasn't started.
        // The onstop logic will handle cleanup.
        const currentStopMonitor = get().stopVolumeMonitor
        if (currentStopMonitor) {
          currentStopMonitor()
        }
        set({
          isRecording: false,
          isBusy: false,
          mediaRecorder: null,
          mediaStream: null,
          stopVolumeMonitor: null,
        })
        return
      }

      mediaRecorder.start(500)
    } catch (error) {
      console.error('Failed to start audio capture:', error)
      if (monitorCleanup) monitorCleanup()
      set({
        isRecording: false,
        isBusy: false,
        mediaRecorder: null,
        mediaStream: null,
        stopVolumeMonitor: null,
      })
    }
  },

  /**
   * Stops capturing audio.
   */
  stopRecording: () => {
    // Immediately update the state to reflect the user's intent to stop.
    // This is the most important part of fixing the race condition.
    set({ isRecording: false })

    const { mediaRecorder, isBusy } = get()

    // If the recorder is starting up but hasn't been created yet, the `startRecording`
    // function will see the `isRecording: false` flag and abort itself.
    if (isBusy && !mediaRecorder) {
      console.log('Stop signal received while starting. Aborting.')
      return
    }

    // If a recorder exists and is currently recording, stop it.
    // The `onstop` handler will perform the final state cleanup.
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
    }
  },
}))

// This watches for changes and notifies the main process.
useAudioStore.subscribe((state, prevState) => {
  if (state.isRecording !== prevState.isRecording) {
    const { microphoneDeviceId } = useSettingsStore.getState()
    window.api.send('recording-state-changed', {
      isRecording: state.isRecording,
      deviceId: microphoneDeviceId,
    })
  }
})