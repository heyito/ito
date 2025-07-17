import { create } from 'zustand'
import type {
  AuthState,
  AuthUser,
  AuthTokens,
  AuthStore,
} from '../../lib/main/store'
import { STORE_KEYS } from '../../lib/constants/store-keys'

interface AuthZustandStore {
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
  const storedAuth = window.electron?.store?.get(STORE_KEYS.AUTH) as
    | (AuthStore & { isSelfHosted?: boolean })
    | undefined

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

  const currentStore = window.electron.store.get(STORE_KEYS.AUTH) || {}
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

  window.electron.store.set(STORE_KEYS.AUTH, updates)
}

export const useAuthStore = create<AuthZustandStore>((set, get) => {
  const initialState = getInitialState()

  return {
    ...initialState,

    setAuthData: (tokens: AuthTokens, user: AuthUser, provider?: string) => {
      // Calculate expires_at if not provided
      const expiresAt =
        tokens.expires_at ||
        (tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined)

      const enhancedUser: AuthUser = {
        ...user,
        provider,
        lastSignInAt: new Date().toISOString(),
      }

      const enhancedTokens = {
        ...tokens,
        expires_at: expiresAt,
      }

      const newState = {
        isAuthenticated: true,
        tokens: enhancedTokens,
        user: enhancedUser,
        state: get().state || null,
        error: null,
      }

      syncToStore({ tokens: enhancedTokens, user: enhancedUser })
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
