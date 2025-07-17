import mainStore from '../main/store'
import { STORE_KEYS } from '../constants/store-keys'
import { audioRecorderService } from './audio'

/**
 * Initializes the microphone selection to prefer built-in microphone over system default
 */
export const initializeMicrophoneSelection = async () => {
  try {
    console.log(
      '[initializeMicrophoneSelection] Initializing microphone selection...',
    )

    // Get current settings from store
    const currentSettings = mainStore.get(STORE_KEYS.SETTINGS)

    // If user has already selected a specific microphone (not default), keep their choice
    if (
      currentSettings?.microphoneDeviceId &&
      currentSettings.microphoneDeviceId !== 'default'
    ) {
      console.log(
        `[initializeMicrophoneSelection] User has selected "${currentSettings.microphoneDeviceId}". Keeping their choice.`,
      )
      return
    }

    const availableDevices = await audioRecorderService.getDeviceList()

    // Look for built-in microphone
    const builtInDevice = availableDevices.find(device => {
      const deviceLower = device.toLowerCase()
      return (
        deviceLower.includes('built-in') ||
        deviceLower.includes('internal') ||
        deviceLower.includes('macbook') ||
        deviceLower.includes('system')
      )
    })

    if (builtInDevice) {
      console.log(
        `[initializeMicrophoneSelection] Setting built-in microphone as default: "${builtInDevice}"`,
      )

      // Update the settings in the store
      const updatedSettings = {
        ...currentSettings,
        microphoneDeviceId: builtInDevice,
        microphoneName: 'Built-in mic (recommended)',
      }
      mainStore.set(STORE_KEYS.SETTINGS, updatedSettings)
    } else {
      console.log(
        '[initializeMicrophoneSelection] No built-in microphone found. Keeping "Auto-detect".',
      )
    }
  } catch (error) {
    console.error(
      '[initializeMicrophoneSelection] Failed to initialize microphone selection:',
      error,
    )
  }
}
