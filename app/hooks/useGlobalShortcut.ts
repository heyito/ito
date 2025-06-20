import { useEffect, useRef } from 'react'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import { useAudioStore } from '@/app/store/useAudioStore'
import { KeyState, normalizeKeyEvent } from '@/app/utils/keyboard'
import { type KeyEvent } from '@/lib/preload/index.d'

export const useGlobalShortcut = () => {
  const { getState: getAudioState, setState: setAudioState } = useAudioStore
  const { getState: getSettingsState } = useSettingsStore

  const keyStateRef = useRef(new KeyState())
  const isShortcutActiveRef = useRef(false)

  useEffect(() => {
    const handleKeyEvent = (event: KeyEvent) => {
      const { isRecording, isShortcutEnabled, startRecording, stopRecording } =
        getAudioState()
      const { keyboardShortcut, microphoneDeviceId } = getSettingsState()

      if (normalizeKeyEvent(event) === 'fn_fast' || !isShortcutEnabled) {
        return
      }

      keyStateRef.current.update(event)
      const currentlyPressedKeys = keyStateRef.current.getPressedKeys()
      const areShortcutKeysHeld =
        keyboardShortcut.length > 0 &&
        keyboardShortcut.every((key) => currentlyPressedKeys.includes(key))

      if (areShortcutKeysHeld && !isShortcutActiveRef.current) {
        // --- Shortcut Pressed ---
        isShortcutActiveRef.current = true
        console.log('Shortcut ACTIVATED, starting recording...')
        startRecording(microphoneDeviceId)
      } else if (!areShortcutKeysHeld && isShortcutActiveRef.current) {
        // --- Shortcut Released ---
        isShortcutActiveRef.current = false
        console.log('Shortcut DEACTIVATED, stopping recording...')
        stopRecording()
      }
    }

    const cleanup: any = window.api.onKeyEvent(handleKeyEvent)
    return () => {
      console.log('Cleaning up global shortcut listener.')
      cleanup()
    }
  }, [])

  return null
}