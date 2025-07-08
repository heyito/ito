import { create } from 'zustand'

export interface AuthState {
  id: string
  codeVerifier: string
  codeChallenge: string
  state: string
}

export interface AuthUser {
  id: string
  email?: string
  name?: string
  picture?: string
  provider?: string
  lastSignInAt?: string
}

export interface AuthTokens {
  access_token?: string
  refresh_token?: string
  id_token?: string
  token_type?: string
  expires_in?: number
}

interface AuthStore {
  // State
  isAuthenticated: boolean
  user: AuthUser | null
  tokens: AuthTokens | null
  state: AuthState | null
  isLoading: boolean
  error: string | null
  isSelfHosted: boolean

  // Actions
  setAuthData: (tokens: AuthTokens, user: AuthUser, provider?: string) => void
  clearAuth: (preserveUser?: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  updateUser: (user: Partial<AuthUser>) => void
  updateState: (state: Partial<AuthState>) => void
  setName: (name: string) => void
  setSelfHostedMode: () => void
}

// Initialize from electron store
const getInitialState = () => {
  const storedAuth = window.electron?.store?.get('auth')

  // Generate new auth state if no stored auth stat

  return {
    isAuthenticated:
      !!storedAuth?.tokens?.access_token || !!storedAuth?.isSelfHosted,
    user: storedAuth?.user || null,
    tokens: storedAuth?.tokens || null,
    state: storedAuth?.state || null,
    isLoading: false,
    error: null,
    isSelfHosted: !!storedAuth?.isSelfHosted,
  }
}

// Sync to electron store
const syncToStore = (state: {
  user?: AuthUser | null
  tokens?: AuthTokens | null
  state?: AuthState | null
  isSelfHosted?: boolean
}) => {
  if (!window.electron?.store) return

  const currentStore = window.electron.store.get('auth') || {}
  const updates: any = { ...currentStore }

  if ('user' in state) {
    updates.user = state.user
  }

  if ('tokens' in state) {
    updates.tokens = state.tokens
  }

  if ('state' in state) {
    updates.state = state.state
  }

  if ('isSelfHosted' in state) {
    updates.isSelfHosted = state.isSelfHosted
  }

  window.electron.store.set('auth', updates)
}

export const useAuthStore = create<AuthStore>((set, get) => {
  const initialState = getInitialState()

  return {
    ...initialState,

    setAuthData: (tokens: AuthTokens, user: AuthUser, provider?: string) => {
      const enhancedUser: AuthUser = {
        ...user,
        provider,
        lastSignInAt: new Date().toISOString(),
      }

      const newState = {
        isAuthenticated: true,
        tokens,
        user: enhancedUser,
        state: get().state || null,
        error: null,
      }

      syncToStore({ tokens, user: enhancedUser })
      set(newState)
    },

    clearAuth: (preserveUser: boolean = true) => {
      const currentUser = get().user

      const newState = {
        isAuthenticated: false,
        user: preserveUser ? currentUser : null,
        tokens: null,
        state: null,
        error: null,
        isSelfHosted: false,
      }

      syncToStore({
        tokens: null,
        user: preserveUser ? currentUser : null,
        state: null,
        isSelfHosted: false,
      })
      set(newState)
    },

    setLoading: (loading: boolean) => {
      set({ isLoading: loading })
    },

    setError: (error: string | null) => {
      set({ error })
    },

    updateUser: (userUpdate: Partial<AuthUser>) => {
      const currentUser = get().user
      if (!currentUser) return

      const updatedUser = { ...currentUser, ...userUpdate }
      syncToStore({ user: updatedUser })
      set({ user: updatedUser })
    },

    setName: (name: string) => {
      const currentUser = get().user
      if (!currentUser) return

      const updatedUser = { ...currentUser, name }
      syncToStore({ user: updatedUser })
      set({ user: updatedUser })
    },

    updateState: (stateUpdate: Partial<AuthState>) => {
      const currentState = get().state
      if (!currentState) return

      const updatedState = { ...currentState, ...stateUpdate }
      syncToStore({ state: updatedState })
      set({ state: updatedState })
    },

    setSelfHostedMode: () => {
      const selfHostedUser: AuthUser = {
        id: 'self-hosted',
        provider: 'self-hosted',
        lastSignInAt: new Date().toISOString(),
      }

      const newState = {
        isAuthenticated: true,
        isSelfHosted: true,
        user: selfHostedUser,
        tokens: null, // No tokens needed for self-hosted
        error: null,
      }

      syncToStore({ user: selfHostedUser, isSelfHosted: true })
      set(newState)
    },
  }
})
