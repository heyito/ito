import { useEffect, useCallback, useRef, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import KeyboardKey from '@/app/components/ui/keyboard-key'
import {
  KeyState,
  normalizeKeyEvent,
  isReservedCombination,
} from '@/app/utils/keyboard'
import { useAudioStore } from '@/app/store/useAudioStore'
import { KeyboardShortcutConfig } from './multi-shortcut-editor'

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

  const cleanupRef = useRef<(() => void) | null>(null)
  const keyStateRef = useRef<KeyState>(new KeyState(shortcutKeys))
  const [pressedKeys, setPressedKeys] = useState<string[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [newShortcut, setNewShortcut] = useState<string[]>([])
  const [validationError, setValidationError] = useState<string>('')
  const { setIsShortcutEnabled } = useAudioStore()

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

          let updatedShortcut: string[]
          if (!newShortcut.includes(normalizedKey)) {
            updatedShortcut = [...newShortcut, normalizedKey]
          } else {
            updatedShortcut = newShortcut.filter(key => key !== normalizedKey)
          }

          // Check for reserved combinations
          const reservedCheck = isReservedCombination(updatedShortcut)
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
    [isEditing, newShortcut],
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

  const handleStartEditing = () => {
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
                Press keys to add them
              </div>
            )}
          </div>
          {validationError && (
            <div className="text-red-500 text-sm text-center mb-2">
              {validationError}
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
                className={`${pressedKeys.includes(keyboardKey.toLowerCase()) ? 'bg-purple-50 border-2 border-purple-200' : 'bg-white border-2 border-neutral-300'}`}
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
            >
              {editButtonText}
            </Button>
            {showConfirmButton && onConfirm && (
              <Button
                size="sm"
                type="button"
                onClick={onConfirm}
                className={confirmButtonClassName}
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
