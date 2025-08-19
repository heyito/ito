import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { Button } from '@/app/components/ui/button'
import KeyboardKey from '@/app/components/ui/keyboard-key'
import { normalizeKeyEvent } from '@/app/utils/keyboard'
import { ItoMode } from '@/app/generated/ito_pb'
import { useSettingsStore } from '@/app/store/useSettingsStore'

export interface KeyboardShortcutConfig {
  id: string
  keys: string[]
  mode: ItoMode
}

type Props = {
  shortcuts: KeyboardShortcutConfig[] // persisted rows
  mode?: ItoMode // optional: filter rows by mode, and used when adding a new one
  className?: string
  keySize?: number
  maxShortcutsPerMode?: number
}

export default function MultiShortcutEditor({
  shortcuts,
  mode,
  className = '',
  keySize = 48,
  maxShortcutsPerMode = 5,
}: Props) {
  const {
    addKeyboardShortcut,
    removeKeyboardShortcut,
    updateKeyboardShortcut,
  } = useSettingsStore()

  const rows = useMemo(
    () => (mode == null ? shortcuts : shortcuts.filter(s => s.mode === mode)),
    [shortcuts, mode],
  )
  const isAtLimit = rows.length >= maxShortcutsPerMode
  const isMinimum = rows.length <= 1

  // editing state
  const [editingId, setEditingId] = useState<string | null>(null) // existing row id or "__new__"
  const [draftKeys, setDraftKeys] = useState<string[]>([])
  const cleanupRef = useRef<(() => void) | null>(null)

  const beginEditExisting = (row: KeyboardShortcutConfig) => {
    setEditingId(row.id)
    setDraftKeys([])
    try {
      window.api.send(
        'electron-store-set',
        'settings.isShortcutGloballyEnabled',
        false,
      )
    } catch {
      //ignore
    }
  }

  const beginEditNew = () => {
    setEditingId('__new__')
    setDraftKeys([])
    try {
      window.api.send(
        'electron-store-set',
        'settings.isShortcutGloballyEnabled',
        false,
      )
    } catch {
      //ignore
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraftKeys([])
    try {
      window.api.send(
        'electron-store-set',
        'settings.isShortcutGloballyEnabled',
        true,
      )
    } catch {
      //ignore
    }
  }

  const saveEdit = (original?: KeyboardShortcutConfig) => {
    if (!draftKeys.length) return
    if (original) {
      // update existing
      updateKeyboardShortcut(original.id, draftKeys)
    } else {
      // add new
      const addMode = mode ?? ItoMode.TRANSCRIBE
      addKeyboardShortcut(draftKeys, addMode)
    }
    cancelEdit()
  }

  // capture keys (no normalization/cleanup here by request)
  const handleKeyEvent = useCallback(
    (event: any) => {
      if (!editingId || event.type !== 'keydown') return
      const key = normalizeKeyEvent(event)
      if (key === 'fn_fast') return
      setDraftKeys(prev =>
        prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
      )
    },
    [editingId],
  )

  useEffect(() => {
    if (!editingId) return
    try {
      cleanupRef.current = window.api.onKeyEvent(handleKeyEvent)
    } catch {
      // ignore
    }
    return () => {
      try {
        cleanupRef.current?.()
      } catch {
        //ignore
      }
    }
  }, [handleKeyEvent, editingId])

  return (
    <div className={className}>
      {rows.map(row => {
        const isEditing = editingId === row.id
        const displayKeys = isEditing ? draftKeys : row.keys

        return (
          <div
            key={row.id}
            className="mb-6 rounded-2xl border border-neutral-200 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-neutral-100 px-3 py-2">
                {displayKeys.length ? (
                  displayKeys.map((k, idx) => (
                    <KeyboardKey key={idx} keyboardKey={k} variant="inline" />
                  ))
                ) : (
                  <span className="text-neutral-400">No keys set</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => removeKeyboardShortcut(row.id)}
                  hidden={isMinimum}
                  className="text-red-600 hover:underline"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => beginEditExisting(row)}
                  className="rounded-xl border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {/* Add new */}
      <div className="mt-2 flex justify-end">
        {editingId === '__new__' ? (
          <div className="w-full rounded-2xl border-2 border-black/80 bg-white px-4 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {draftKeys.length ? (
                draftKeys.map((k, idx) => (
                  <KeyboardKey
                    key={idx}
                    keyboardKey={k}
                    className="bg-white border-2 border-neutral-300"
                    style={{ width: keySize, height: keySize }}
                  />
                ))
              ) : (
                <span className="text-neutral-400 text-xl">Press key</span>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => saveEdit(undefined)}
                disabled={!draftKeys.length}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={beginEditNew}
            hidden={isAtLimit}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-md text-neutral-800 disabled:opacity-50"
          >
            Add another
          </button>
        )}
      </div>
    </div>
  )
}
