import { useEffect, useRef } from 'react'
import log from 'electron-log'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import { KeyState } from '@/app/utils/keyboard'

export const useGlobalShortcut = () => {
  const { getState: getSettingsStore, subscribe } = useSettingsStore

  // We only need to initialize KeyState once. It will be updated via the store subscription.
  const keyStateRef = useRef(new KeyState(getSettingsStore().keyboardShortcut))

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

    return () => {
      unsubscribe()
    }
  }, [getSettingsStore, subscribe])

  return null
}
