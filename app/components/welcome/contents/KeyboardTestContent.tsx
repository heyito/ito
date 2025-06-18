import { useEffect, useCallback, useRef, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import KeyboardKey from '../../ui/keyboard-key'
import { KeyState, normalizeKeyEvent } from '@/app/utils/keyboard'

export default function KeyboardTestContent() {
  const {
    incrementOnboardingStep,
    decrementOnboardingStep,
  } = useOnboardingStore()
  const { keyboardShortcut, setKeyboardShortcut } = useSettingsStore()
  const cleanupRef = useRef<(() => void) | null>(null)
  const keyStateRef = useRef<KeyState>(new KeyState(keyboardShortcut))
  const [pressedKeys, setPressedKeys] = useState<string[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [newShortcut, setNewShortcut] = useState<string[]>([])

  const handleKeyEvent = useCallback(
    (event: any) => {
      // Update the key state
      keyStateRef.current.update(event)

      // Get the current pressed keys and update state
      const currentPressedKeys = keyStateRef.current.getPressedKeys()
      setPressedKeys(currentPressedKeys)

      if (isEditing) {
        // In edit mode, handle adding/removing keys
        if (event.type === 'keydown') {
          const normalizedKey = normalizeKeyEvent(event)
          if (normalizedKey === 'fn_fast') {
            return
          }
          if (!newShortcut.includes(normalizedKey)) {
            setNewShortcut(prev => [...prev, normalizedKey])
          } else {
            setNewShortcut(prev => prev.filter(key => key !== normalizedKey))
          }
        }
      } else {
        // In normal mode, check if the pressed keys match our keyboard shortcut
        const normalizedShortcut = keyboardShortcut.map(key =>
          key.toLowerCase(),
        )
        const isMatch = normalizedShortcut.every(key =>
          currentPressedKeys.includes(key.toLowerCase()),
        )

        if (
          isMatch &&
          currentPressedKeys.length === normalizedShortcut.length
        ) {
          // All keys in the shortcut are pressed
          // Keyboard shortcut matched - could add visual feedback here
        }
      }
    },
    [keyboardShortcut, isEditing, newShortcut],
  )

  useEffect(() => {
    // Start the key listener when the component mounts
    window.api.startKeyListener()

    // Capture the current keyState ref value for cleanup
    const currentKeyState = keyStateRef.current

    // Block necessary keys for the shortcut
    const keysToBlock = currentKeyState.getKeysToBlock()
    if (keysToBlock.length > 0) {
      window.api.blockKeys(keysToBlock)
    } else {
      window.api.unblockKey('Unknown(179)')
    }

    // Listen for key events and store cleanup function
    try {
      const cleanup = window.api.onKeyEvent(handleKeyEvent)
      cleanupRef.current = cleanup
    } catch (error) {
      console.error('Failed to set up key event handler:', error)
    }

    // Clean up when the component unmounts
    return () => {
      if (cleanupRef.current) {
        try {
          cleanupRef.current()
        } catch (error) {
          console.error('Error during cleanup:', error)
        }
      }
      // Clear the key state when unmounting using captured ref value
      if (currentKeyState) {
        currentKeyState.clear()
      }
    }
  }, [handleKeyEvent, keyboardShortcut])

  const handleStartEditing = () => {
    setIsEditing(true)
    setNewShortcut([])
  }

  const handleCancel = () => {
    setIsEditing(false)
    setNewShortcut([])
  }

  const handleSave = () => {
    if (newShortcut.length === 0) {
      throw new Error('Shortcut cannot be empty')
    }
    keyStateRef.current.updateShortcut(newShortcut)
    setKeyboardShortcut(newShortcut)
    setIsEditing(false)
  }

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start px-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12 overflow-hidden">
          <div className="mt-8">
            <button
              className="mb-4 text-sm text-muted-foreground hover:underline"
              type="button"
              onClick={decrementOnboardingStep}
            >
              &lt; Back
            </button>
            <h1 className="text-3xl mb-4 mt-12">
              Press the keyboard shortcut to test it out
            </h1>
            <div className="text-base text-muted-foreground mb-8 max-w-md">
              We recommend the{' '}
              <span className="inline-flex items-center px-2 py-0.5 bg-neutral-100 border rounded text-xs font-mono ml-1">
                fn
              </span>{' '}
              key at the bottom left of the keyboard
            </div>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-gradient-to-b from-purple-50/10 to-purple-100 border-l-2 border-purple-100">
        <div
          className="bg-white rounded-xl shadow-lg p-6 flex flex-col items-center"
          style={{ minWidth: 500, maxHeight: 280 }}
        >
          {isEditing ? (
            <>
              <div className="text-lg font-medium mb-6 text-center">
                Press a key to add it to the shortcut, press it again to remove
                it
              </div>
              <div
                className="flex justify-center items-center mb-6 w-full bg-neutral-100 py-4 rounded-lg gap-2"
                style={{ minHeight: 112 }}
              >
                {newShortcut.map((keyboardKey, index) => (
                  <KeyboardKey
                    key={index}
                    keyboardKey={keyboardKey}
                    className="bg-white border-2 border-neutral-300"
                    style={{
                      width: '80px',
                      height: '80px',
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-2 mt-2 w-full justify-end">
                <Button
                  variant="outline"
                  className=""
                  type="button"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button className="" type="button" onClick={handleSave}>
                  Save
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-lg font-medium mb-6 text-center">
                Does the button turn purple while pressing it?
              </div>
              <div
                className="flex justify-center items-center mb-6 w-full bg-neutral-100 py-4 rounded-lg gap-2"
                style={{ minHeight: 112 }}
              >
                {keyboardShortcut.map((keyboardKey, index) => (
                  <KeyboardKey
                    key={index}
                    keyboardKey={keyboardKey}
                    className={`${pressedKeys.includes(keyboardKey.toLowerCase()) ? 'bg-purple-50 border-2 border-purple-200' : 'bg-white border-2 border-neutral-300'}`}
                    style={{
                      width: '80px',
                      height: '80px',
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-2 mt-2 w-full justify-end">
                <Button
                  variant="outline"
                  className="w-44"
                  type="button"
                  onClick={handleStartEditing}
                >
                  No, change shortcut
                </Button>
                <Button
                  className="w-16"
                  type="button"
                  onClick={incrementOnboardingStep}
                >
                  Yes
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
