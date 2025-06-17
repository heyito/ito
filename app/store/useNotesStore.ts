import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export type Note = {
  id: string
  content: string
  createdAt: Date
  updatedAt: Date
}

interface NotesStore {
  notes: Note[]
  addNote: (content: string) => void
  updateNote: (
    id: string,
    updates: Partial<Omit<Note, 'id' | 'createdAt'>>
  ) => void
  deleteNote: (id: string) => void
  loadNotes: () => void
  saveNotes: () => void
}

// Initialize from electron store
const getInitialNotes = (): Note[] => {
  try {
    const storedNotes = window.electron.store.get('notes')
    if (storedNotes && Array.isArray(storedNotes)) {
      return storedNotes.map((note) => ({
        ...note,
        createdAt: new Date(note.createdAt),
        updatedAt: new Date(note.updatedAt),
      }))
    }
  } catch (error) {
    console.error('Error loading notes from store:', error)
  }
  return []
}

// Sync to electron store
const syncNotesToStore = (notes: Note[]) => {
  try {
    window.electron.store.set('notes', notes)
  } catch (error) {
    console.error('Error saving notes to store:', error)
  }
}

export const useNotesStore = create<NotesStore>((set, get) => ({
  notes: getInitialNotes(),

  addNote: (content: string) => {
    const newNote: Note = {
      id: uuidv4(),
      content: content.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    set((state) => {
      const newNotes = [newNote, ...state.notes]
      syncNotesToStore(newNotes)
      return { notes: newNotes }
    })
  },

  updateNote: (
    id: string,
    updates: Partial<Omit<Note, 'id' | 'createdAt'>>
  ) => {
    set((state) => {
      const newNotes = state.notes.map((note) =>
        note.id === id ? { ...note, ...updates, updatedAt: new Date() } : note
      )
      syncNotesToStore(newNotes)
      return { notes: newNotes }
    })
  },

  deleteNote: (id: string) => {
    set((state) => {
      const newNotes = state.notes.filter((note) => note.id !== id)
      syncNotesToStore(newNotes)
      return { notes: newNotes }
    })
  },

  loadNotes: () => {
    const notes = getInitialNotes()
    set({ notes })
  },

  saveNotes: () => {
    const { notes } = get()
    syncNotesToStore(notes)
  },
}))
