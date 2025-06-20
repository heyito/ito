import { useAuth0 } from '@auth0/auth0-react'
import { useCallback, useEffect } from 'react'
import { Auth0Connections } from './config'
import {
  useAuthStore,
  type AuthUser,
  type AuthTokens,
} from '../../store/useAuthStore'
import { useMainStore } from '@/app/store/useMainStore'

export const useAuth = () => {
  const {
    logout,
    user,
    isAuthenticated: auth0IsAuthenticated,
    isLoading: auth0IsLoading,
    error: auth0Error,
    getAccessTokenSilently,
    getIdTokenClaims,
  } = useAuth0()

  // Get auth state from our store
  const {
    isAuthenticated: storeIsAuthenticated,
    user: storeUser,
    tokens,
    isLoading: storeIsLoading,
    error: storeError,
    clearAuth,
    setSelfHostedMode,
  } = useAuthStore()

  // Combine Auth0 and store state - prioritize store state for external auth
  const isAuthenticated = storeIsAuthenticated || auth0IsAuthenticated
  const isLoading = storeIsLoading || auth0IsLoading
  const error = storeError || auth0Error

  // Convert Auth0 user to our user interface
  const auth0User: AuthUser | null = user
    ? {
        id: user.sub || '',
        email: user.email,
        name: user.name,
        picture: user.picture,
        emailVerified: user.email_verified,
      }
    : null

  // Prioritize store user over Auth0 user
  const authUser = storeUser || auth0User

  // Handle auth code from protocol URL - only set up listener once globally
  useEffect(() => {
    if (!window.api?.on) {
      console.warn('window.api.on not available')
      return
    }

    // Check if listener is already set up
    if ((window as any).__authCodeListenerSetup) {
      return
    }

    // Mark that we've set up the listener
    ;(window as any).__authCodeListenerSetup = true

    const cleanup = window.api.on(
      'auth-code-received',
      async (authCode: string, state: string) => {
        try {
          // Import Auth0 config
          const { Auth0Config } = await import('./config')

          // Exchange authorization code for tokens via main process
          const result = await window.api.invoke('exchange-auth-code', {
            authCode,
            state,
            config: Auth0Config,
          })

          if (!result.success) {
            throw new Error(result.error)
          }

          // Store tokens and user info in the auth store
          if (result.tokens && result.userInfo) {
            useAuthStore
              .getState()
              .setAuthData(
                result.tokens as AuthTokens,
                result.userInfo as AuthUser,
              )

            useMainStore.getState().setCurrentPage('home')
          } else {
            throw new Error('Missing tokens or user info in response')
          }
        } catch (error) {
          console.error('Error handling auth code from protocol URL:', error)
          alert(
            `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          )
        }
      },
    )

    return () => {
      cleanup()
      ;(window as any).__authCodeListenerSetup = false
    }
  }, [])

  // External browser authentication - now the primary method
  const openExternalAuth = useCallback(
    async (
      connection?: string,
      options?: { email?: string; mode?: 'login' | 'signup' },
    ) => {
      let authState = useAuthStore.getState().state

      // Generate new auth state if not available
      if (!authState) {
        try {
          // Generate fresh auth state from the main process
          authState = await window.api.generateNewAuthState()

          if (!authState) {
            throw new Error('Generated auth state is null')
          }

          // Update the store with the new auth state
          useAuthStore.getState().updateState(authState)
        } catch (error) {
          console.error('Failed to generate new auth state:', error)
          throw new Error(
            'Failed to generate auth state. Please restart the app.',
          )
        }
      }

      const { Auth0Config } = await import('./config')

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: Auth0Config.clientId,
        redirect_uri: Auth0Config.redirectUri,
        scope: Auth0Config.scope,
        prompt: 'select_account',
        state: authState.state,
        code_challenge: authState.codeChallenge,
        code_challenge_method: 'S256',
      })

      // Add audience if configured
      if (Auth0Config.audience) {
        params.append('audience', Auth0Config.audience)
      }

      if (connection) {
        params.append('connection', connection)
      }

      if (options?.email) {
        params.append('login_hint', options.email)
      }

      if (options?.mode === 'signup') {
        params.append('screen_hint', 'signup')
      }

      const authUrl = `https://${Auth0Config.domain}/authorize?${params.toString()}`

      // Open in external browser
      if (window.api?.invoke) {
        await window.api.invoke('web-open-url', authUrl)
      } else {
        window.open(authUrl, '_blank')
      }
    },
    [],
  )

  // Social authentication methods - now use external browser by default
  const loginWithGoogle = useCallback(async () => {
    try {
      await openExternalAuth(Auth0Connections.google)
    } catch (error) {
      console.error('Google external auth failed:', error)
      throw error
    }
  }, [openExternalAuth])

  const loginWithMicrosoft = useCallback(async () => {
    try {
      await openExternalAuth(Auth0Connections.microsoft)
    } catch (error) {
      console.error('Microsoft external auth failed:', error)
      throw error
    }
  }, [openExternalAuth])

  const loginWithApple = useCallback(async () => {
    try {
      await openExternalAuth(Auth0Connections.apple)
    } catch (error) {
      console.error('Apple external auth failed:', error)
      throw error
    }
  }, [openExternalAuth])

  // Email/password authentication - now uses external browser
  const loginWithEmail = useCallback(
    async (email: string) => {
      try {
        await openExternalAuth(undefined, { email, mode: 'signup' })
      } catch (error) {
        console.error('Email login error:', error)
        throw error
      }
    },
    [openExternalAuth],
  )

  // GitHub authentication - now uses external browser
  const loginWithGitHub = useCallback(async () => {
    try {
      await openExternalAuth(Auth0Connections.github)
    } catch (error) {
      console.error('GitHub login error:', error)
      throw error
    }
  }, [openExternalAuth])

  // Self-hosted authentication - bypasses all external auth
  const loginWithSelfHosted = useCallback(() => {
    try {
      setSelfHostedMode()
    } catch (error) {
      console.error('Self-hosted mode activation error:', error)
      throw error
    }
  }, [setSelfHostedMode])

  // Get access token for API calls
  const getAccessToken = useCallback(async () => {
    try {
      // First try to get from our store (for external auth)
      if (tokens?.access_token) {
        return tokens.access_token
      }

      // Fallback to Auth0 silent auth (for popup/redirect auth)
      return await getAccessTokenSilently()
    } catch (error) {
      console.error('Error getting access token:', error)
      throw error
    }
  }, [getAccessTokenSilently, tokens])

  // Logout
  const logoutUser = useCallback(() => {
    // Clear our auth store
    clearAuth()

    // Also logout from Auth0 if using Auth0 session
    if (auth0IsAuthenticated) {
      logout({
        logoutParams: {
          returnTo: window.location.origin,
        },
      })
    }
  }, [logout, clearAuth, auth0IsAuthenticated])

  return {
    // Auth state
    user: authUser,
    isAuthenticated,
    isLoading,
    error,

    // Authentication methods
    loginWithGoogle,
    loginWithMicrosoft,
    loginWithApple,
    loginWithEmail,
    loginWithGitHub,
    loginWithSelfHosted,
    logoutUser,

    // Utilities
    getAccessToken,
    getIdTokenClaims,
  }
}
