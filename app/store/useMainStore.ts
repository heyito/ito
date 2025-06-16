import { create } from 'zustand'

interface MainStore {
  navExpanded: boolean
  toggleNavExpanded: () => void
}

// Initialize from electron store
const getInitialState = () => {
  const storedMain = window.electron.store.get('main')

  return {
    navExpanded: storedMain?.navExpanded ?? false,
  }
}

// Sync to electron store
const syncToStore = (state: Partial<MainStore>) => {
  if ('navExpanded' in state) {
    const currentStore = window.electron.store.get('main') || {}
    window.electron.store.set('main', {
      ...currentStore,
      navExpanded: state.navExpanded ?? currentStore.navExpanded,
    })
  }
}

export const useMainStore = create<MainStore>((set) => {
  const initialState = getInitialState()
  return {
    navExpanded: initialState.navExpanded,
    toggleNavExpanded: () =>
      set((state) => {
        const newState = { navExpanded: !state.navExpanded }
        syncToStore(newState)
        return newState
      }),
  }
})
