import { create } from 'zustand'
import { setupMicrophone } from '@/lib/media/microphone'

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
  setIsShortcutEnabled: (enabled: boolean) => void
  startRecording: (deviceId: string) => Promise<void>
  stopRecording: () => void
}

export const useAudioStore = create<AudioState>((set, get) => ({
  isRecording: false,
  isShortcutEnabled: true, // The shortcut is enabled by default.
  mediaRecorder: null,
  mediaStream: null,

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
    const { isRecording, isShortcutEnabled } = get()
    // Prevent starting a new recording if one is already active or if shortcuts are disabled.
    if (isRecording || !isShortcutEnabled) return

    console.log('Starting audio capture...')
    try {
      // Set up the microphone and get the media stream.
      const { stream } = await setupMicrophone(deviceId)

      // Create a new MediaRecorder instance with the stream.
      const recorder = new MediaRecorder(stream)

      // Set up the event listener for when audio data is available.
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          // Send the collected audio data to our gRPC stub.
          grpcStub.sendAudioChunk(event.data)
        }
      }

      // When the recorder stops, clean up the stream and reset the state.
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop()) // Release the microphone.
        set({ isRecording: false, mediaRecorder: null, mediaStream: null })
        console.log('Audio capture stopped and resources released.')
      }

      // Start recording and collect data in 1-second chunks.
      recorder.start(1000)

      // Update the state to reflect that we are now recording.
      set({ isRecording: true, mediaRecorder: recorder, mediaStream: stream })
    } catch (error) {
      console.error('Failed to start audio capture:', error)
      // Ensure state is clean in case of an error.
      set({ isRecording: false, mediaRecorder: null, mediaStream: null })
    }
  },

  /**
   * Stops the current audio recording.
   */
  stopRecording: () => {
    const { mediaRecorder } = get()
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      console.log('Stopping audio capture...')
      mediaRecorder.stop()
    }
  },
}))