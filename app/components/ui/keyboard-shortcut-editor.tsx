import { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { Button } from '@/app/components/ui/button'
import KeyboardKey from '@/app/components/ui/keyboard-key'
import { KeyState, isReservedCombination } from '@/app/utils/keyboard'
import { keyNameMap } from '@/lib/types/keyboard'
import { useAudioStore } from '@/app/store/useAudioStore'
import { KeyboardShortcutConfig } from './multi-shortcut-editor'
import { KeyName } from '@/lib/types/keyboard'
import { usePlatform } from '@/app/hooks/usePlatform'
import { useShortcutEditingStore } from '@/app/store/useShortcutEditingStore'

interface KeyboardShortcutEditorProps {
  shortcut: KeyboardShortcutConfig
  onShortcutChange: (shortcutId: string, newShortcutKeys: string[]) => void
  hideTitle?: boolean
  className?: string
  keySize?: number
  editButtonText?: string
  confirmButtonText?: string
  showConfirmButton?: boolean
  onConfirm?: () => void
  editModeTitle?: string
  viewModeTitle?: string
  minHeight?: number
  editButtonClassName?: string
  confirmButtonClassName?: string
}

const MAX_KEYS_PER_SHORTCUT = 5

export default function KeyboardShortcutEditor({
  shortcut,
  onShortcutChange,
  hideTitle = false,
  className = '',
  keySize = 60,
  editButtonText = 'Change Shortcut',
  confirmButtonText = 'Yes',
  showConfirmButton = false,
  onConfirm,
  editModeTitle = 'Press a key to add it to the shortcut, press it again to remove it',
  viewModeTitle,
  minHeight = 84,
  editButtonClassName = '',
  confirmButtonClassName = '',
}: KeyboardShortcutEditorProps) {
  const shortcutKeys = shortcut.keys
  const platform = usePlatform()
  const editorKey = useMemo(
    () => `keyboard-shortcut-editor:${shortcut.id}`,
    [shortcut.id],
  )
  const { start, stop, activeEditor } = useShortcutEditingStore()

  const cleanupRef = useRef<(() => void) | null>(null)
  const keyStateRef = useRef<KeyState>(new KeyState(shortcutKeys))
  const [pressedKeys, setPressedKeys] = useState<string[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [newShortcut, setNewShortcut] = useState<KeyName[]>([])
  const [validationError, setValidationError] = useState<string>('')
  const [temporaryError, setTemporaryError] = useState<string>('')
  const { setIsShortcutEnabled } = useAudioStore()
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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
          const normalizedKey = keyNameMap[event.key] || event.key.toLowerCase()
          if (normalizedKey === 'fn_fast') {
            return
          }

          let updatedShortcut: KeyName[]
          if (!newShortcut.includes(normalizedKey)) {
            // Check if we're at the limit before adding
            if (newShortcut.length >= MAX_KEYS_PER_SHORTCUT) {
              // Clear any existing timeout
              if (errorTimeoutRef.current) {
                clearTimeout(errorTimeoutRef.current)
              }

              // Show temporary error
              setTemporaryError(`Maximum ${MAX_KEYS_PER_SHORTCUT} keys allowed`)

              // Clear temporary error after 2 seconds
              errorTimeoutRef.current = setTimeout(() => {
                setTemporaryError('')
                errorTimeoutRef.current = null
              }, 2000)

              return
            }
            updatedShortcut = [...newShortcut, normalizedKey]
          } else {
            updatedShortcut = newShortcut.filter(key => key !== normalizedKey)
          }

          // Check for reserved combinations
          const reservedCheck = isReservedCombination(updatedShortcut, platform)
          if (reservedCheck.isReserved) {
            setValidationError(
              reservedCheck.reason || 'This key combination is reserved',
            )
          } else {
            setValidationError('')
          }

          setNewShortcut(updatedShortcut)
        }
      }
    },
    [isEditing, newShortcut, platform],
  )

  useEffect(() => {
    // Update key state when shortcut changes
    keyStateRef.current.updateShortcut(shortcutKeys)
  }, [shortcut, shortcutKeys])

  useEffect(() => {
    // Capture the current keyState ref value for cleanup
    const currentKeyState = keyStateRef.current

    // Listen for key events and store cleanup function
    try {
      const cleanup = window.api.onKeyEvent(handleKeyEvent)
      cleanupRef.current = cleanup
    } catch (error) {
      console.error('Failed to set up key event handler:', error)
    }

    // Clean up when component unmounts or editing changes
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
  }, [handleKeyEvent, isEditing])

  useEffect(() => {
    return () => {
      if (isEditing) {
        window.api.send(
          'electron-store-set',
          'settings.isShortcutGloballyEnabled',
          true,
        )
        stop(editorKey)
      }
      // Clean up any pending error timeout
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
      }
    }
  }, [isEditing, stop, editorKey])

  const handleStartEditing = () => {
    if (!start(editorKey)) {
      return
    }
    // Disable the shortcut in the main process via IPC
    window.api.send(
      'electron-store-set',
      'settings.isShortcutGloballyEnabled',
      false,
    )
    setIsShortcutEnabled(false)
    setIsEditing(true)
    setNewShortcut([])
    setValidationError('')
    setTemporaryError('')
  }

  const handleCancel = () => {
    window.api.send(
      'electron-store-set',
      'settings.isShortcutGloballyEnabled',
      true,
    )
    setIsShortcutEnabled(true)
    setIsEditing(false)
    setNewShortcut([])
    setTemporaryError('')
    stop(editorKey)
  }

  const handleSave = () => {
    if (newShortcut.length === 0) {
      // Don't save empty shortcuts
      return
    }
    keyStateRef.current.updateShortcut(newShortcut)
    onShortcutChange(shortcut.id, newShortcut)
    setIsEditing(false)
    setIsShortcutEnabled(true)
    window.api.send(
      'electron-store-set',
      'settings.isShortcutGloballyEnabled',
      true,
    )
    stop(editorKey)
  }

  function isDisplayKeyPressed(displayKey: string, pressed: string[]): boolean {
    return pressed.includes(displayKey.toLowerCase())
  }

  return (
    <div className={`bg-white rounded-lg ${className}`}>
      {isEditing ? (
        <>
          {!hideTitle && (
            <div className="text-lg font-medium mb-6 text-center">
              {editModeTitle}
            </div>
          )}
          <div
            className="flex justify-center items-center mb-4 w-full bg-neutral-100 py-3 rounded-lg gap-2"
            style={{ minHeight }}
          >
            {newShortcut.map((keyboardKey, index) => (
              <KeyboardKey
                key={index}
                keyboardKey={keyboardKey}
                className="bg-white border-2 border-neutral-300"
                style={{
                  width: `${keySize}px`,
                  height: `${keySize}px`,
                }}
              />
            ))}
            {newShortcut.length === 0 && (
              <div className="text-gray-400 text-sm">
                Press keys to add them (max {MAX_KEYS_PER_SHORTCUT} keys)
              </div>
            )}
          </div>
          {(validationError || temporaryError) && (
            <div className="text-red-500 text-sm text-center mb-2">
              {temporaryError || validationError}
            </div>
          )}
          <div className="flex gap-2 justify-end w-full mt-1">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              type="button"
              onClick={handleSave}
              disabled={newShortcut.length === 0 || !!validationError}
            >
              Save
            </Button>
          </div>
        </>
      ) : (
        <>
          {viewModeTitle && !hideTitle && (
            <div className="text-lg font-medium mb-6 text-center">
              {viewModeTitle}
            </div>
          )}
          <div
            className="flex justify-center items-center mb-4 w-full bg-neutral-100 py-3 rounded-lg gap-2"
            style={{ minHeight }}
          >
            {shortcutKeys.map((keyboardKey, index) => (
              <KeyboardKey
                key={index}
                keyboardKey={keyboardKey}
                className={`${isDisplayKeyPressed(String(keyboardKey), pressedKeys) ? 'bg-purple-50 border-2 border-purple-200' : 'bg-white border-2 border-neutral-300'}`}
                style={{
                  width: `${keySize}px`,
                  height: `${keySize}px`,
                }}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2 w-full mt-1">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleStartEditing}
              className={editButtonClassName}
              disabled={activeEditor !== null && activeEditor !== editorKey}
            >
              {editButtonText}
            </Button>
            {showConfirmButton && onConfirm && (
              <Button
                size="sm"
                type="button"
                onClick={onConfirm}
                className={confirmButtonClassName}
                disabled={activeEditor !== null && activeEditor !== editorKey}
              >
                {confirmButtonText}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
