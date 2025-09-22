import { create } from 'zustand'

interface ShortcutEditingState {
  activeEditor: string | null
  start: (editorKey: string) => boolean
  stop: (editorKey: string) => void
  isActive: (editorKey: string) => boolean
}

export const useShortcutEditingStore = create<ShortcutEditingState>(
  (set, get) => ({
    activeEditor: null,
    start: (editorKey: string): boolean => {
      const current = get().activeEditor
      if (current && current !== editorKey) return false
      if (current === editorKey) return true
      set({ activeEditor: editorKey })
      return true
    },
    stop: (editorKey: string): void => {
      const current = get().activeEditor
      if (current === editorKey) {
        set({ activeEditor: null })
      }
    },
    isActive: (editorKey: string): boolean => get().activeEditor === editorKey,
  }),
)
