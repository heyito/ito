import { useEffect, useRef } from 'react'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import { useAudioStore } from '@/app/store/useAudioStore'
import { KeyState, normalizeKeyEvent } from '@/app/utils/keyboard'
import { type KeyEvent } from '@/lib/preload/index.d'

export const useGlobalShortcut = () => {
  const { getState: getAudioState } = useAudioStore
  const { getState: getSettingsState } = useSettingsStore

  const keyStateRef = useRef(new KeyState())
  const isShortcutActiveRef = useRef(false)

  useEffect(() => {
    // This effect runs only once to set up and tear down the listener.
    const handleKeyEvent = (event: KeyEvent) => {
      // Get the LATEST state directly from the stores to avoid stale closures.
      const { isRecording, isShortcutEnabled, startRecording, stopRecording } =
        getAudioState()
      const { keyboardShortcut, microphoneDeviceId } = getSettingsState()

      // Ignore noisy events or if the feature is disabled.
      if (normalizeKeyEvent(event) === 'fn_fast' || !isShortcutEnabled) {
        return
      }

      // Update the central key state with the latest event.
      keyStateRef.current.update(event)
      const currentlyPressedKeys = keyStateRef.current.getPressedKeys()

      // Check if all keys required by the shortcut are present.
      const areShortcutKeysHeld =
        keyboardShortcut.length > 0 &&
        keyboardShortcut.every((key) => currentlyPressedKeys.includes(key))

      // --- State transition logic ---

      if (areShortcutKeysHeld && !isShortcutActiveRef.current) {
        // CONDITION MET: The shortcut has just been completed.
        console.log('Shortcut ACTIVATED, starting recording...')
        isShortcutActiveRef.current = true
        if (!isRecording) {
          startRecording(microphoneDeviceId)
        }
      } else if (!areShortcutKeysHeld && isShortcutActiveRef.current) {
        // CONDITION MET: The shortcut has just been broken.
        console.log('Shortcut DEACTIVATED, stopping recording...')
        isShortcutActiveRef.current = false
        if (isRecording) {
          stopRecording()
        }
      }
    }

    // Subscribe to key events from the global listener.
    const cleanup: any = window.api.onKeyEvent(handleKeyEvent)

    // Return the cleanup function, which will be called when the app closes.
    return () => {
      console.log('Cleaning up global shortcut listener.')
      cleanup()
    }
  }, []) // <-- Empty dependency array ensures this setup runs only once.

  return null
}