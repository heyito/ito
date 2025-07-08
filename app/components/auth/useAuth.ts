import { useAuth0 } from '@auth0/auth0-react'
import { useCallback, useEffect } from 'react'
import { Auth0Connections, Auth0Config } from './config'
import {
  useAuthStore,
  type AuthUser,
  type AuthTokens,
} from '../../store/useAuthStore'
import { useMainStore } from '@/app/store/useMainStore'
import { analytics, ANALYTICS_EVENTS, identifyUser } from '../analytics'

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
        provider: user.sub?.includes('|') ? user.sub.split('|')[0] : 'unknown',
        lastSignInAt: new Date().toISOString(),
      }
    : null

  // Prioritize store user over Auth0 user
  const authUser = storeUser || auth0User

  useEffect(() => {
    if (authUser) {
      analytics.identifyUser(authUser.id, {
        user_id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        provider: authUser.provider,
        created_at: authUser.lastSignInAt,
      })
    }
  }, [authUser])

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
            // Extract provider from Auth0 user ID (format: "provider|id")
            const providerId = result.userInfo.id || ''
            const provider = providerId.includes('|')
              ? providerId.split('|')[0]
              : 'unknown'

            // Check if this is a returning user
            const existingUser = useAuthStore.getState().user
            const isReturningUser =
              !!existingUser && existingUser.id === result.userInfo.id

            useAuthStore
              .getState()
              .setAuthData(
                result.tokens as AuthTokens,
                result.userInfo as AuthUser,
                provider,
              )

            // Track successful signin
            analytics.trackAuth(ANALYTICS_EVENTS.AUTH_SIGNIN_COMPLETED, {
              provider,
              is_returning_user: isReturningUser,
              user_id: result.userInfo.id,
            })

            useMainStore.getState().setCurrentPage('home')

            await window.api.notifyLoginSuccess(
              result.userInfo,
              result.tokens.id_token,
              result.tokens.access_token,
            )
          } else {
            throw new Error('Missing tokens or user info in response')
          }
        } catch (error) {
          console.error('Error handling auth code from protocol URL:', error)

          // Track signin failure
          analytics.track(ANALYTICS_EVENTS.AUTH_SIGNIN_FAILED, {
            error_message:
              error instanceof Error ? error.message : 'Unknown error',
            auth_method: 'external_browser',
          })

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
      // Track signin attempt started
      const provider = connection || 'unknown'
      const eventType =
        options?.mode === 'signup'
          ? ANALYTICS_EVENTS.AUTH_SIGNUP_STARTED
          : ANALYTICS_EVENTS.AUTH_SIGNIN_STARTED

      analytics.trackAuth(eventType, {
        provider,
        is_returning_user: false, // We don't know yet
        auth_method: 'external_browser',
      })

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

          // Track auth state generation failure
          analytics.track(ANALYTICS_EVENTS.AUTH_STATE_GENERATION_FAILED, {
            provider,
            error_message:
              error instanceof Error ? error.message : 'Unknown error',
          })

          throw new Error(
            'Failed to generate auth state. Please restart the app.',
          )
        }
      }

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

  // Helper function to reduce duplication in social auth methods
  const createSocialAuthMethod = useCallback(
    (connection: string, providerName: string) => {
      return async (email?: string) => {
        try {
          await openExternalAuth(connection, email ? { email } : undefined)
        } catch (error) {
          console.error(`${providerName} external auth failed:`, error)

          // Track auth method failure
          analytics.track(ANALYTICS_EVENTS.AUTH_METHOD_FAILED, {
            provider: providerName.toLowerCase(),
            error_message:
              error instanceof Error ? error.message : 'Unknown error',
            auth_method: 'external_browser',
          })

          throw error
        }
      }
    },
    [openExternalAuth],
  )

  // Social authentication methods - now use external browser by default
  const loginWithGoogle = createSocialAuthMethod(
    Auth0Connections.google,
    'Google',
  )
  const loginWithMicrosoft = createSocialAuthMethod(
    Auth0Connections.microsoft,
    'Microsoft',
  )
  const loginWithApple = createSocialAuthMethod(Auth0Connections.apple, 'Apple')

  // GitHub authentication - now uses external browser
  const loginWithGitHub = createSocialAuthMethod(
    Auth0Connections.github,
    'GitHub',
  )

  // Self-hosted authentication - bypasses all external auth
  const loginWithSelfHosted = useCallback(async () => {
    try {
      // Track self-hosted signin attempt
      analytics.trackAuth(ANALYTICS_EVENTS.AUTH_SIGNIN_STARTED, {
        provider: 'self-hosted',
        is_returning_user: false,
        auth_method: 'self_hosted',
      })

      setSelfHostedMode()

      // Notify main process about self-hosted login and wait for it to complete
      const selfHostedProfile = {
        id: 'self-hosted',
        provider: 'self-hosted',
        lastSignInAt: new Date().toISOString(),
      }

      await window.api.notifyLoginSuccess(
        selfHostedProfile,
        null, // No idToken for self-hosted
        null, // No accessToken for self-hosted
      )

      // Track successful self-hosted signin
      analytics.trackAuth(ANALYTICS_EVENTS.AUTH_SIGNIN_COMPLETED, {
        provider: 'self-hosted',
        is_returning_user: false,
        user_id: 'self-hosted',
        auth_method: 'self_hosted',
      })
    } catch (error) {
      console.error('Self-hosted mode activation error:', error)

      // Track self-hosted signin failure
      analytics.track(ANALYTICS_EVENTS.AUTH_SIGNIN_FAILED, {
        provider: 'self-hosted',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        auth_method: 'self_hosted',
      })

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
  const logoutUser = useCallback(
    async (completelySignOut: boolean = false) => {
      try {
        // Track logout attempt
        const currentUser = authUser
        analytics.trackAuth(ANALYTICS_EVENTS.AUTH_LOGOUT, {
          provider: currentUser?.provider || 'unknown',
          is_returning_user: true, // If they're logging out, they were logged in
          user_id: currentUser?.id,
          complete_signout: completelySignOut,
          session_duration_ms: analytics.getSessionDuration(),
        })

        // Clear main process store first
        await window.api.logout()

        // Clear our auth store, preserving user data by default
        clearAuth(!completelySignOut)

        // Also logout from Auth0 if using Auth0 session
        if (auth0IsAuthenticated) {
          logout({
            logoutParams: {
              returnTo: window.location.origin,
            },
          })
        }
      } catch (error) {
        console.error('Error during logout:', error)

        // Track logout failure
        analytics.track(ANALYTICS_EVENTS.AUTH_LOGOUT_FAILED, {
          provider: authUser?.provider || 'unknown',
          error_message:
            error instanceof Error ? error.message : 'Unknown error',
          complete_signout: completelySignOut,
        })

        // Still try to clear local auth even if main process logout fails
        clearAuth(!completelySignOut)
      }
    },
    [logout, clearAuth, auth0IsAuthenticated, authUser, analytics],
  )

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
    loginWithGitHub,
    loginWithSelfHosted,
    logoutUser,

    // Utilities
    getAccessToken,
    getIdTokenClaims,
  }
}
