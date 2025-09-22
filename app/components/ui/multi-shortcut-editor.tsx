import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import KeyboardKey from '@/app/components/ui/keyboard-key'
import { normalizeKeyEvent, ShortcutError } from '@/app/utils/keyboard'
import { ItoMode } from '@/app/generated/ito_pb'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import { Check, Pencil } from '@mynaui/icons-react'
import { cx } from 'class-variance-authority'
import { KeyName } from '@/lib/types/keyboard'
import { useShortcutEditingStore } from '@/app/store/useShortcutEditingStore'

export interface KeyboardShortcutConfig {
  id: string
  keys: KeyName[]
  mode: ItoMode
}

type Props = {
  shortcuts: KeyboardShortcutConfig[] // persisted rows
  mode: ItoMode
  className?: string
  keySize?: number
  maxShortcutsPerMode?: number
}

const MAX_KEYS_PER_SHORTCUT = 5

export default function MultiShortcutEditor({
  shortcuts,
  mode,
  className = '',
  maxShortcutsPerMode = 5,
}: Props) {
  const {
    createKeyboardShortcut,
    removeKeyboardShortcut,
    updateKeyboardShortcut,
  } = useSettingsStore()

  // global editing lock
  const editorKey = useMemo(() => `multi-shortcut-editor:${mode}`, [mode])
  const { start, stop, activeEditor } = useShortcutEditingStore()

  const rows = useMemo(
    () => (mode == null ? shortcuts : shortcuts.filter(s => s.mode === mode)),
    [shortcuts, mode],
  )
  const isAtLimit = rows.length >= maxShortcutsPerMode
  const isMinimum = rows.length <= 1

  // editing state
  const [editingId, setEditingId] = useState<string | null>(null) // existing row id or "__new__"
  const [draftKeys, setDraftKeys] = useState<KeyName[]>([])
  const [error, setError] = useState<string>('')

  const cleanupRef = useRef<(() => void) | null>(null)

  const beginEditExisting = (row: KeyboardShortcutConfig) => {
    if (!start(editorKey)) {
      setError('Finish editing the other shortcut set first.')
      return
    }
    setEditingId(row.id)
    setDraftKeys([])
    setError('')

    window.api.send(
      'electron-store-set',
      'settings.isShortcutGloballyEnabled',
      false,
    )
  }

  const getErrorMessage = (error: ShortcutError, message?: string) => {
    switch (error) {
      case 'duplicate-key-same-mode':
        return 'This key combination is already in use for this mode.'
      case 'duplicate-key-diff-mode':
        return 'This key combination is already in use for a different mode.'
      case 'not-found':
        return 'The specified shortcut was not found.'
      case 'reserved-combination':
        return message || 'This key combination is reserved and cannot be used.'
      default:
        return 'An unknown error occurred.'
    }
  }

  const addNew = () => {
    const result = createKeyboardShortcut(mode)
    if (!result.success && result.error) {
      setError(getErrorMessage(result.error, result.errorMessage))
      return
    }
  }

  const stopEdit = () => {
    setEditingId(null)
    setDraftKeys([])
    setError('')

    window.api.send(
      'electron-store-set',
      'settings.isShortcutGloballyEnabled',
      true,
    )
    stop(editorKey)
  }

  const saveEdit = async (original: KeyboardShortcutConfig) => {
    if (!draftKeys.length) return

    // update existing
    const result = await updateKeyboardShortcut(original.id, draftKeys)
    if (!result.success && result.error) {
      setError(getErrorMessage(result.error, result.errorMessage))
      return
    }

    stopEdit()
  }

  // capture keys (no normalization/cleanup here by request)
  const handleKeyEvent = useCallback(
    (event: any) => {
      if (!editingId || event.type !== 'keydown') return
      const key = normalizeKeyEvent(event)
      if (key === 'fn_fast') return
      if (draftKeys.length >= MAX_KEYS_PER_SHORTCUT) return // limit to 5 keys

      setDraftKeys(prev =>
        prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
      )

      // Clear error when user starts typing new keys
      setError('')
    },
    [draftKeys.length, editingId],
  )

  useEffect(() => {
    if (!editingId) return

    cleanupRef.current = window.api.onKeyEvent(handleKeyEvent)

    return () => {
      cleanupRef.current?.()
    }
  }, [handleKeyEvent, editingId])

  // Ensure lock is released and global shortcuts re-enabled on unmount
  useEffect(() => {
    return () => {
      if (editingId) {
        try {
          window.api.send(
            'electron-store-set',
            'settings.isShortcutGloballyEnabled',
            true,
          )
        } catch {}
        stop(editorKey)
      }
    }
  }, [editingId, stop, editorKey])

  const base =
    'inline-flex items-center justify-center rounded-xl border border-neutral-300 ' +
    'px-3 py-1.5 text-neutral-700 hover:bg-neutral-50 h-9 min-w-[48px] border-0'

  const isLockedByOther = activeEditor !== null && activeEditor !== editorKey

  return (
    <div className={cx('w-82', className)}>
      {rows.map(row => {
        const isEditing = editingId === row.id
        const displayKeys = isEditing ? draftKeys : row.keys

        return (
          <div
            key={row.id}
            className="mb-1 rounded-lg border border-neutral-200 bg-white p-1"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center justify-between gap-1">
                {displayKeys.length ? (
                  displayKeys.map((k, idx) => (
                    <KeyboardKey key={idx} keyboardKey={k} variant="inline" />
                  ))
                ) : (
                  <span className="text-neutral-400">No keys set</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {editingId === row.id ? (
                  <button
                    type="button"
                    onClick={() => saveEdit(row)}
                    className={base}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => beginEditExisting(row)}
                    className={
                      base + ' disabled:opacity-50 disabled:cursor-not-allowed'
                    }
                    disabled={isLockedByOther}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {editingId === row.id && error && (
              <div className="mt-1 text-xs text-red-500">{error}</div>
            )}
          </div>
        )
      })}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            const lastRow = rows.at(-1)
            if (lastRow) {
              removeKeyboardShortcut(lastRow.id)
            }
          }}
          hidden={isMinimum}
          className="ml-auto text-red-400 hover:underline text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLockedByOther}
        >
          Delete
        </button>
      </div>

      {/* Add new */}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (isLockedByOther) return
            addNew()
          }}
          hidden={isAtLimit}
          className="rounded-md border border-neutral-300 py-1 px-2 text-md text-neutral-800 disabled:opacity-50 hover:bg-neutral-50 disabled:cursor-not-allowed"
          disabled={isLockedByOther}
        >
          Add another
        </button>
      </div>
    </div>
  )
}
