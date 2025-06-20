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
    // Prevent starting a new recording if one is already active.
    if (get().isRecording) return

    // Optimistically set recording state to true.
    set({ isRecording: true })

    console.log('Starting audio capture...')

    // Clean up any old monitor just in case.
    const stopMonitor = get().stopVolumeMonitor
    if (stopMonitor) stopMonitor()

    try {
      const { stream } = await setupMicrophone(deviceId)

      // After awaiting, check if a stop command was issued during setup.
      if (!get().isRecording) {
        console.log('Recording cancelled during initialization.')
        stream.getTracks().forEach(track => track.stop())
        return // Abort if stopRecording was called.
      }

      // We need to use a specific mimeType for the media recorder.
      const mimeType = 'audio/webm'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })

      // Setup a function to monitor the volume.
      const monitorCleanup = await setupVolumeMonitoring((volume) => {
        window.api.send('volume-update', volume)
      }, deviceId)

      // When the media recorder receives a chunk of audio data, send it to the gRPC service.
      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          grpcStub.sendAudioChunk(event.data)
        }
      }

      mediaRecorder.onstart = () => {
        console.log('MediaRecorder started.')
      }

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped, cleaning up resources.')
        stream.getTracks().forEach(track => track.stop())
        const stopMonitor = get().stopVolumeMonitor
        if (stopMonitor) stopMonitor()
        set({ mediaRecorder: null, mediaStream: null, stopVolumeMonitor: null })
      }

      // Start recording, collecting audio into chunks every 500ms.
      mediaRecorder.start(500)

      // Store the recorder and stream so they can be stopped later.
      set({ mediaRecorder, mediaStream: stream, stopVolumeMonitor: monitorCleanup })
    } catch (error) {
      console.error('Failed to start audio capture:', error)
      // Ensure we clean up and reset state on failure
      get().mediaStream?.getTracks().forEach(track => track.stop())
      get().stopVolumeMonitor?.()
      set({ isRecording: false, mediaRecorder: null, mediaStream: null, stopVolumeMonitor: null })
    }
  },

  /**
   * Stops capturing audio.
   */
  stopRecording: () => {
    const { mediaRecorder } = get()

    // Set recording to false immediately to signal intent to stop.
    // This is crucial for the race condition fix.
    set({ isRecording: false })

    // If the recorder exists, stop it. The 'onstop' event will handle cleanup.
    if (mediaRecorder) {
      console.log('Stopping recording...')
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop()
      }
    } else {
      // If the recorder doesn't exist, it means startRecording was called but hasn't completed.
      // The change in `isRecording` state will be detected by the check within `startRecording`.
      console.log('Stopping a pending recording.')
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