import { useEffect, useRef } from 'react'
import log from 'electron-log'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import { useAudioStore } from '@/app/store/useAudioStore'
import { KeyState, normalizeKeyEvent } from '@/app/utils/keyboard'
import { type KeyEvent } from '@/lib/preload/index.d'

export const useGlobalShortcut = () => {
  const { getState: getAudioState } = useAudioStore
  const { getState: getSettingsStore, subscribe } = useSettingsStore

  // We only need to initialize KeyState once. It will be updated via the store subscription.
  const keyStateRef = useRef(new KeyState(getSettingsStore().keyboardShortcut))
  const isShortcutActiveRef = useRef(false)

  useEffect(() => {
    // Subscribe to changes in the settings store.
    // When the keyboard shortcut changes, update our KeyState instance.
    const unsubscribe = subscribe(state => {
      log.info(
        'Shortcut changed, updating blocked keys:',
        state.keyboardShortcut,
      )
      keyStateRef.current.updateShortcut(state.keyboardShortcut)
    })

    const handleKeyEvent = (event: KeyEvent) => {
      const { isShortcutEnabled, startRecording, stopRecording } =
        getAudioState()
      const { keyboardShortcut } = getSettingsStore()

      if (normalizeKeyEvent(event) === 'fn_fast' || !isShortcutEnabled) {
        return
      }

      keyStateRef.current.update(event)
      const currentlyPressedKeys = keyStateRef.current.getPressedKeys()
      const areShortcutKeysHeld =
        keyboardShortcut.length > 0 &&
        keyboardShortcut.every(key => currentlyPressedKeys.includes(key))

      if (areShortcutKeysHeld && !isShortcutActiveRef.current) {
        // --- Shortcut Pressed ---
        isShortcutActiveRef.current = true
        log.info('Shortcut ACTIVATED, starting recording...')
        startRecording(getSettingsStore().microphoneDeviceId)
      } else if (!areShortcutKeysHeld && isShortcutActiveRef.current) {
        // --- Shortcut Released ---
        isShortcutActiveRef.current = false
        log.info('Shortcut DEACTIVATED, stopping recording...')
        stopRecording()
      }
    }

    const cleanupKeyListener: any = window.api.onKeyEvent(handleKeyEvent)

    return () => {
      console.log('Cleaning up global shortcut listener and subscription.')
      unsubscribe()
      cleanupKeyListener()
    }
  }, [getAudioState, getSettingsStore, subscribe]) // Dependencies for effect

  return null
}
