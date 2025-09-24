import { create } from 'zustand'
import { useAuthStore } from './useAuthStore'
import type { DictionaryItem } from '../../lib/main/sqlite/models'

export type DictionaryEntry = {
  id: string
  type: 'normal' | 'replacement'
  createdAt: string // Changed to string to match DB
  updatedAt: string // Changed to string to match DB
} & (
  | {
      type: 'normal'
      content: string
    }
  | {
      type: 'replacement'
      from: string
      to: string
    }
)

interface DictionaryStore {
  entries: DictionaryEntry[]
  loadEntries: () => Promise<void>
  addEntry: (content: string) => Promise<void>
  addReplacement: (from: string, to: string) => Promise<void>
  updateEntry: (
    id: string,
    updates: Partial<Omit<DictionaryEntry, 'id' | 'createdAt' | 'type'>>,
  ) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
}

/**
 * The backend stores a flat DictionaryItem, but the frontend uses a more
 * structured DictionaryEntry. This function maps the backend type to the
 * frontend type.
 * We infer the type based on whether `pronunciation` is null.
 */
const mapItemToEntry = (item: DictionaryItem): DictionaryEntry => {
  if (item.pronunciation === null || item.pronunciation === '') {
    return {
      id: item.id,
      type: 'normal',
      content: item.word,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }
  } else {
    return {
      id: item.id,
      type: 'replacement',
      from: item.word,
      to: item.pronunciation,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }
  }
}

export const useDictionaryStore = create<DictionaryStore>((set, get) => ({
  entries: [],

  loadEntries: async () => {
    try {
      const items = await window.api.dictionary.getAll()
      const entries = items.map(mapItemToEntry)
      set({ entries })
    } catch (error) {
      console.error('Failed to load dictionary from database:', error)
    }
  },

  addEntry: async (content: string) => {
    const { user } = useAuthStore.getState()
    if (!user) return
    const result = await window.api.dictionary.add({
      user_id: user.id,
      word: content.trim(),
      pronunciation: null,
    })
    if (!result.success) {
      throw new Error(result.error)
    }
    const newEntry = mapItemToEntry(result.data)
    set(state => ({ entries: [newEntry, ...state.entries] }))
  },

  addReplacement: async (from: string, to: string) => {
    const { user } = useAuthStore.getState()
    if (!user) return
    const result = await window.api.dictionary.add({
      user_id: user.id,
      word: from.trim(),
      pronunciation: to.trim(),
    })
    if (!result.success) {
      throw new Error(result.error)
    }
    const newEntry = mapItemToEntry(result.data)
    set(state => ({ entries: [newEntry, ...state.entries] }))
  },

  updateEntry: async (id, updates) => {
    const originalEntry = get().entries.find(e => e.id === id)
    if (!originalEntry) return

    // Create a new entry object with the updates applied
    const updatedEntry = { ...originalEntry, ...updates }

    let word: string
    let pronunciation: string | null

    if (updatedEntry.type === 'normal') {
      word = updatedEntry.content
      pronunciation = null
    } else {
      word = updatedEntry.from
      pronunciation = updatedEntry.to
    }

    const result = await window.api.dictionary.update(id, word, pronunciation)
    if (!result.success) {
      throw new Error(result.error)
    }
    get().loadEntries() // Reload all entries to reflect the change
  },

  deleteEntry: async (id: string) => {
    try {
      await window.api.dictionary.delete(id)
      set(state => ({ entries: state.entries.filter(e => e.id !== id) }))
    } catch (error) {
      console.error('Failed to delete dictionary entry:', error)
    }
  },
}))
