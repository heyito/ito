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
    // If we're already in the process of starting/stopping, or already recording, do nothing.
    if (get().isBusy || get().isRecording) {
      return
    }

    set({ isBusy: true })

    const stopMonitor = get().stopVolumeMonitor
    if (stopMonitor) stopMonitor()

    let stream: MediaStream | null = null
    let monitorCleanup: (() => void) | null = null

    try {
      // Now that we're busy, we can set the recording state.
      set({ isRecording: true })

      const volumeSetup = await setupVolumeMonitoring((volume) => {
        window.api.send('volume-update', volume)
      }, deviceId)

      stream = volumeSetup.stream
      monitorCleanup = volumeSetup.cleanup

      // After awaiting, check if a stop command was issued during setup.
      if (!get().isRecording) {
        console.log('Recording cancelled during initialization.')
        // The monitorCleanup function handles stream and audio context cleanup.
        monitorCleanup()
        return // Abort if stopRecording was called.
      }

      if (!stream) {
        throw new Error('Failed to setup microphone stream.')
      }

      // We need to use a specific mimeType for the media recorder.
      const mimeType = 'audio/webm'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })

      mediaRecorder.onstart = () => {
        console.log('MediaRecorder started.')
      }

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped, cleaning up resources.')
        // The currently stored stopVolumeMonitor is the correct cleanup function.
        const currentStopMonitor = get().stopVolumeMonitor
        if (currentStopMonitor) {
          currentStopMonitor()
        }
        set({ mediaRecorder: null, mediaStream: null, stopVolumeMonitor: null })
      }

      // Start recording, collecting audio into chunks every 500ms.
      mediaRecorder.start(500)

      // FINAL CHECK: A stop command could have arrived while we were setting up.
      // If so, we need to abort and clean up what we've created.
      if (!get().isRecording) {
        console.log('Recording cancelled just before finalizing state.')
        mediaRecorder.stop() // This triggers the onstop handler for full cleanup.
        return
      }

      // Store the recorder and stream so they can be stopped later.
      set({ mediaRecorder, mediaStream: stream, stopVolumeMonitor: monitorCleanup })
    } catch (error) {
      console.error('Failed to start audio capture:', error)
      // If an error occurred, call the cleanup function if it exists.
      if (monitorCleanup) {
        monitorCleanup()
      }
      set({ isRecording: false, mediaRecorder: null, mediaStream: null, stopVolumeMonitor: null })
    } finally {
      // Always release the busy lock
      set({ isBusy: false })
    }
  },

  /**
   * Stops capturing audio.
   */
  stopRecording: () => {
    const { mediaRecorder } = get()

    // Signal the intent to stop recording immediately.
    // The various checks in the startRecording flow will handle aborting the process.
    set({ isRecording: false })

    // If the recorder exists and is active, stop it.
    // The 'onstop' event will handle the final cleanup.
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      console.log('Stopping recording...')
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