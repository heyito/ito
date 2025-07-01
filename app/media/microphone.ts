import { useSettingsStore } from "../store/useSettingsStore"

// In your renderer process (main window)
async function setupMicrophone(deviceId?: string) {
  try {
    // Request microphone access with specific device if provided
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    })

    // Create audio context
    const audioContext = new window.AudioContext()
    const source = audioContext.createMediaStreamSource(stream)

    return { audioContext, source, stream }
  } catch (error) {
    console.error('Error accessing microphone:', error)
    throw error
  }
}

type Microphone = {
  deviceId: string
  label: string
}

type MicrophoneToRender = {
  title: string
  description?: string
}

async function getAvailableMicrophones(): Promise<Microphone[]> {
  try {
    console.log('Fetching available native microphones...')
    // This now gets the list directly from our Rust binary via the main process
    const deviceNames: string[] = await window.api.invoke(
      'get-native-audio-devices',
    )
    console.log('Available native microphones:', deviceNames)
    // The deviceId and label are the same in this new system
    return deviceNames.map(name => ({
      deviceId: name,
      label: name,
    }))
  } catch (error) {
    console.error('Error getting available native microphones:', error)
    return []
  }
}

/**
 * Verifies if the currently selected microphone in settings is still connected.
 * If not, it gracefully falls back to the "default" auto-detect setting.
 */
export async function verifyStoredMicrophone() {
  try {
    console.log('[verifyStoredMicrophone] Verifying selected microphone...')
    const { microphoneDeviceId, setMicrophoneDeviceId } = useSettingsStore.getState()

    // If the user already has "default" selected, there's nothing to verify.
    if (microphoneDeviceId === 'default') {
      console.log('[verifyStoredMicrophone] "Auto-detect" is selected. Verification not needed.')
      return
    }

    // Get the list of currently available microphones from the native backend.
    const availableDevices: string[] = await window.api.invoke('get-native-audio-devices')

    // Check if the stored deviceId is in the list of available devices.
    const isDeviceAvailable = availableDevices.includes(microphoneDeviceId)

    if (isDeviceAvailable) {
      console.log(`[verifyStoredMicrophone] Stored microphone "${microphoneDeviceId}" is still available.`)
    } else {
      console.warn(`[verifyStoredMicrophone] Stored microphone "${microphoneDeviceId}" is not available. Falling back to "Auto-detect".`)
      // The device is disconnected. Update the store to use the default.
      // We pass the friendly name "Auto-detect" to keep the UI consistent.
      setMicrophoneDeviceId('default', 'Auto-detect')
    }
  } catch (error) {
    console.error('[verifyStoredMicrophone] Failed to verify microphone:', error)
  }
}

async function setupVolumeMonitoring(
  callback: (volume: number) => void,
  deviceId?: string,
) {
  // 1. Start the native audio capture.
  window.api.send('start-native-recording', deviceId)

  // 2. Listen for volume updates from the main process.
  const cleanupListener = window.api.on('volume-update', callback)

  // 3. Return a cleanup function.
  const cleanup = () => {
    // Stop listening to events to prevent memory leaks.
    cleanupListener()
    // Tell the native process to stop capturing audio.
    window.api.send('stop-native-recording')
  }

  // The stream object is no longer relevant here.
  return { cleanup, stream: null }
}

const microphoneToRender = (microphone: Microphone): MicrophoneToRender => {
  const label = microphone.label.toLowerCase()

  // Handle default device case
  if (label.includes('default -')) {
    return {
      title: `Auto-detect`,
      description:
        'May connect to Bluetooth earbuds, slowing transcription speed',
    }
  }

  // Handle built-in microphone
  if (label.includes('built-in') || label.includes('macbook pro microphone')) {
    return {
      title: 'Built-in mic (recommended)',
    }
  }

  // Default case - return original label
  return {
    title: microphone.label,
  }
}

export {
  setupMicrophone,
  setupVolumeMonitoring,
  getAvailableMicrophones,
  microphoneToRender,
}

export type { Microphone, MicrophoneToRender }
