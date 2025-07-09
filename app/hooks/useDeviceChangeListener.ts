import { useEffect } from 'react'
import log from 'electron-log'

/**
 * A React hook that listens for changes in media devices (e.g., plugging in or
 * unplugging a microphone/headset) and notifies the main process.
 * This should be used once in a long-lived component, like the root App component.
 */
export const useDeviceChangeListener = (): void => {
  useEffect(() => {
    // Define the handler function that will be called on the event.
    const handleDeviceChange = () => {
      log.info(
        '[Renderer] `devicechange` event detected. Notifying main process.',
      )
      window.api.send('audio-devices-changed')
    }

    // Add the event listener when the component mounts.
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)

    // Return a cleanup function to remove the listener when the component unmounts.
    // This is crucial for preventing memory leaks and ensuring good practice.
    return () => {
      navigator.mediaDevices.removeEventListener(
        'devicechange',
        handleDeviceChange,
      )
      log.info('[useDeviceChangeListener] Removed devicechange listener.')
    }
  }, []) // The empty dependency array ensures this effect runs only once on mount.
}
