import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export type DictionaryEntry = {
  id: string
  type: 'normal' | 'replacement'
  createdAt: Date
  updatedAt: Date
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
  addEntry: (content: string) => void
  addReplacement: (from: string, to: string) => void
  updateEntry: (
    id: string,
    updates: Partial<Omit<DictionaryEntry, 'id' | 'createdAt'>>
  ) => void
  deleteEntry: (id: string) => void
  loadEntries: () => void
  saveEntries: () => void
}

// Initialize from electron store
const getInitialEntries = (): DictionaryEntry[] => {
  try {
    const storedEntries = window.electron.store.get('dictionary')
    if (storedEntries && Array.isArray(storedEntries)) {
      return storedEntries.map((entry) => ({
        ...entry,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt),
      }))
    }
  } catch (error) {
    console.error('Error loading dictionary entries from store:', error)
  }
  return []
}

// Sync to electron store
const syncEntriesToStore = (entries: DictionaryEntry[]) => {
  try {
    window.electron.store.set('dictionary', entries)
  } catch (error) {
    console.error('Error saving dictionary entries to store:', error)
  }
}

export const useDictionaryStore = create<DictionaryStore>((set, get) => ({
  entries: getInitialEntries(),

  addEntry: (content: string) => {
    const newEntry: DictionaryEntry = {
      id: uuidv4(),
      type: 'normal',
      content: content.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as DictionaryEntry

    set((state) => {
      const newEntries = [newEntry, ...state.entries]
      syncEntriesToStore(newEntries)
      return { entries: newEntries }
    })
  },

  addReplacement: (from: string, to: string) => {
    const newEntry: DictionaryEntry = {
      id: uuidv4(),
      type: 'replacement',
      from: from.trim(),
      to: to.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as DictionaryEntry

    set((state) => {
      const newEntries = [newEntry, ...state.entries]
      syncEntriesToStore(newEntries)
      return { entries: newEntries }
    })
  },

  updateEntry: (
    id: string,
    updates: Partial<Omit<DictionaryEntry, 'id' | 'createdAt'>>
  ) => {
    set((state) => {
      const newEntries = state.entries.map((entry) =>
        entry.id === id
          ? ({ ...entry, ...updates, updatedAt: new Date() } as DictionaryEntry)
          : entry
      )
      syncEntriesToStore(newEntries)
      return { entries: newEntries }
    })
  },

  deleteEntry: (id: string) => {
    set((state) => {
      const newEntries = state.entries.filter((entry) => entry.id !== id)
      syncEntriesToStore(newEntries)
      return { entries: newEntries }
    })
  },

  loadEntries: () => {
    const entries = getInitialEntries()
    set({ entries })
  },

  saveEntries: () => {
    const { entries } = get()
    syncEntriesToStore(entries)
  },
}))
