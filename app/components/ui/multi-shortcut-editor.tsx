import { useCallback, useEffect, useRef, useState } from 'react'
import KeyboardKey from '@/app/components/ui/keyboard-key'
import { Button } from '@/app/components/ui/button'
import { normalizeKeyEvent } from '@/app/utils/keyboard'
import { ItoMode } from '@/app/generated/ito_pb'
import { Pencil } from 'lucide-react' // replace with your icon if needed

type Shortcut = string[]

interface MultiShortcutEditorProps {
  shortcuts: Shortcut[]
  onChange: (next: Shortcut[], mode: ItoMode) => void
  mode?: ItoMode
  className?: string
  keySize?: number
  maxShortcuts?: number
}

export default function MultiShortcutEditor({
  shortcuts,
  onChange,
  mode = ItoMode.TRANSCRIBE,
  className = '',
  keySize = 48,
  maxShortcuts = 5,
}: MultiShortcutEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<Shortcut>([])
  const cleanupRef = useRef<(() => void) | null>(null)

  const startEditing = (index: number) => {
    setEditingIndex(index)
    setDraft(shortcuts[index] ?? [])
    try {
      // pause global shortcut while editing
      window.api.send(
        'electron-store-set',
        'settings.isShortcutGloballyEnabled',
        false,
      )
    } catch {
      //ignore
    }
  }

  const stopEditing = (commit: boolean) => {
    if (editingIndex === null) return
    if (commit && draft.length) {
      const next = [...shortcuts]
      next[editingIndex] = draft
      onChange(next, mode)
    }
    setEditingIndex(null)
    setDraft([])
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

  const addEntry = () => {
    const next = [...shortcuts, []]
    onChange(next, mode)
    // immediately edit the new row
    setTimeout(() => startEditing(next.length - 1), 0)
  }

  const deleteEntry = (index: number) => {
    const next = shortcuts.filter((_, i) => i !== index)
    onChange(next, mode)
    if (editingIndex === index) stopEditing(false)
  }

  const handleKeyEvent = useCallback(
    (event: any) => {
      if (editingIndex === null) return
      if (event.type !== 'keydown') return
      const key = normalizeKeyEvent(event)
      if (key === 'fn_fast') return
      setDraft(prev =>
        prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
      )
    },
    [editingIndex],
  )

  useEffect(() => {
    if (editingIndex === null) return
    try {
      const cleanup = window.api.onKeyEvent(handleKeyEvent)
      cleanupRef.current = cleanup
    } catch {
      //ignore
    }
    return () => {
      try {
        cleanupRef.current?.()
      } catch {
        // ignore
      }
    }
  }, [handleKeyEvent, editingIndex])

  return (
    <div className={className}>
      {shortcuts.map((combo, i) => {
        const isEditing = editingIndex === i
        const value = isEditing ? draft : combo
        return (
          <div
            key={i}
            className="mb-6 rounded-2xl border border-neutral-200 bg-white p-3"
          >
            {/* view header */}
            {!isEditing && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-neutral-100 px-3 py-2">
                    {value.length ? (
                      value.map((k, idx) => (
                        <KeyboardKey
                          key={idx}
                          keyboardKey={k}
                          className="bg-white border-2 border-neutral-300"
                          style={{ width: keySize, height: keySize }}
                        />
                      ))
                    ) : (
                      <span className="text-neutral-400">No keys set</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEditing(i)}
                  className="inline-flex items-center gap-1 rounded-xl border border-neutral-300 px-3 py-1.5 text-neutral-600 hover:bg-neutral-50"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              </div>
            )}

            {/* edit panel */}
            {isEditing && (
              <div className="space-y-3">
                <div className="rounded-2xl border-2 border-black/80 bg-white px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {value.length ? (
                      value.map((k, idx) => (
                        <KeyboardKey
                          key={idx}
                          keyboardKey={k}
                          className="bg-white border-2 border-neutral-300"
                          style={{ width: keySize, height: keySize }}
                        />
                      ))
                    ) : (
                      <span className="text-neutral-400 text-xl">
                        Press key
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Add new shortcut</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => deleteEntry(i)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => stopEditing(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => stopEditing(true)}
                      disabled={!draft.length}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={addEntry}
          disabled={shortcuts.length >= maxShortcuts}
          className="rounded-2xl border border-neutral-300 px-4 py-2 text-lg text-neutral-800 disabled:opacity-50"
        >
          Add another
        </button>
      </div>
    </div>
  )
}
