import { useAuth0 } from '@auth0/auth0-react'
import { useCallback, useEffect, useMemo } from 'react'
import { Auth0Connections, Auth0Config } from '../../../lib/auth/config'
import { useAuthStore } from '../../store/useAuthStore'
import { type AuthUser, type AuthTokens } from '../../../lib/main/store'
import { useMainStore } from '@/app/store/useMainStore'
import { ANALYTICS_EVENTS } from '@/lib/types/analytics'
import { analytics } from '../analytics'
import { STORE_KEYS } from '../../../lib/constants/store-keys'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'

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
  const auth0User: AuthUser | null = useMemo(() => {
    if (!user) return null
    return {
      id: user.sub || '',
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: user.sub?.includes('|') ? user.sub.split('|')[0] : 'unknown',
      lastSignInAt: new Date().toISOString(), // Only updated when user object changes
    }
  }, [user]) // Dependency array now correctly includes 'user'

  // Prioritize store user over Auth0 user
  const authUser = storeUser || auth0User

  // Hydrate per-user onboarding state helper
  async function hydrateOnboardingState(context?: string): Promise<void> {
    try {
      const saved = await window.api.getOnboardingState?.()
      const onboarding = useOnboardingStore.getState()
      if (saved?.onboardingCompleted) {
        onboarding.setOnboardingCompleted()
      } else {
        onboarding.resetOnboarding()
        onboarding.incrementOnboardingStep()
      }
    } catch (e) {
      const suffix = context ? ` (${context})` : ''
      console.warn(`[useAuth] Failed to hydrate onboarding state${suffix}:`, e)
    }
  }

  // Check for token expiration on startup
  useEffect(() => {
    // Check if we have valid auth state stored
    const storedAuth = window.electron?.store?.get(STORE_KEYS.AUTH)
    const hasStoredTokens = storedAuth?.tokens?.access_token
    // Also check main store for tokens (backwards compatibility)
    const hasMainStoreToken = window.electron?.store?.get(
      STORE_KEYS.ACCESS_TOKEN,
    )

    if ((hasStoredTokens || hasMainStoreToken) && !isAuthenticated) {
      console.log('Detected expired tokens on startup, clearing auth state')

      // Clear any remaining auth data
      clearAuth(true)

      // Track the automatic logout
      const currentUser = authUser
      if (currentUser) {
        analytics.trackAuth(ANALYTICS_EVENTS.AUTH_LOGOUT, {
          provider: currentUser.provider || 'unknown',
          is_returning_user: true,
          user_id: currentUser.id,
          complete_signout: false,
          session_duration_ms: analytics.getSessionDuration(),
          reason: 'token_expired_startup',
        })
      }
    }
  }, [isAuthenticated, authUser, clearAuth])

  useEffect(() => {
    if (authUser) {
      analytics.identifyUser(
        authUser.id,
        {
          user_id: authUser.id,
          email: authUser.email,
          name: authUser.name,
          provider: authUser.provider,
          created_at: authUser.lastSignInAt,
        },
        authUser.provider,
      )

      // Notify pill window of user authentication
      if (window.api?.notifyUserAuthUpdate) {
        window.api.notifyUserAuthUpdate({
          id: authUser.id,
          email: authUser.email,
          name: authUser.name,
          provider: authUser.provider,
        })
      }
    } else {
      // Notify pill window that user is not authenticated (logout/reset)
      if (window.api?.notifyUserAuthUpdate) {
        console.log('[useAuth] Notifying pill window of user reset')
        window.api.notifyUserAuthUpdate(null)
      }
    }
  }, [
    authUser,
    auth0IsAuthenticated,
    auth0User,
    storeIsAuthenticated,
    storeUser,
  ])

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

            // Hydrate per-user onboarding state from SQLite for the now-authenticated user
            await hydrateOnboardingState()
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

  // Email/password via Auth0 Database connection
  const loginWithEmail = useCallback(
    async (email?: string) => {
      try {
        await openExternalAuth(
          Auth0Connections.database,
          email ? { email, mode: 'login' } : { mode: 'login' },
        )
      } catch (error) {
        console.error('Email login failed:', error)
        analytics.track(ANALYTICS_EVENTS.AUTH_METHOD_FAILED, {
          provider: 'email',
          error_message:
            error instanceof Error ? error.message : 'Unknown error',
          auth_method: 'external_browser',
        })
        throw error
      }
    },
    [openExternalAuth],
  )

  // Direct email/password login without opening a browser window
  const loginWithEmailPassword = useCallback(
    async (
      email: string,
      password: string,
      options?: { skipNavigate?: boolean },
    ) => {
      try {
        analytics.trackAuth(ANALYTICS_EVENTS.AUTH_SIGNIN_STARTED, {
          provider: 'email',
          is_returning_user: false,
          auth_method: 'password_realm',
        })

        const result = await window.api.invoke('auth0-db-login', {
          email,
          password,
        })
        if (!result?.success || !result?.tokens) {
          throw new Error(result?.error || 'Login failed')
        }

        const tokens = result.tokens as AuthTokens
        const idToken = tokens.id_token || ''
        let userInfo: AuthUser | null = null
        try {
          const payloadPart = idToken.split('.')[1]
          const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
          const padded = base64 + '==='.slice((base64.length + 3) % 4)
          const json = atob(padded)
          const payload = JSON.parse(json)
          userInfo = {
            id: payload.sub || '',
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
            provider:
              typeof payload.sub === 'string' && payload.sub.includes('|')
                ? payload.sub.split('|')[0]
                : 'email',
            lastSignInAt: new Date().toISOString(),
          }
        } catch {
          console.warn(
            'Failed to decode id_token, proceeding with minimal profile',
          )
          userInfo = {
            id: 'email',
            email,
            provider: 'email',
            lastSignInAt: new Date().toISOString(),
          }
        }

        useAuthStore
          .getState()
          .setAuthData(tokens, userInfo as AuthUser, 'email')

        analytics.trackAuth(ANALYTICS_EVENTS.AUTH_SIGNIN_COMPLETED, {
          provider: 'email',
          is_returning_user: false,
          user_id: userInfo?.id,
        })

        if (!options?.skipNavigate) {
          useMainStore.getState().setCurrentPage('home')
        }

        await window.api.notifyLoginSuccess(
          userInfo,
          tokens.id_token ?? null,
          tokens.access_token ?? null,
        )

        // Hydrate per-user onboarding state
        await hydrateOnboardingState('email/password')
      } catch (error) {
        console.error('Email/password login failed:', error)
        analytics.track(ANALYTICS_EVENTS.AUTH_METHOD_FAILED, {
          provider: 'email',
          error_message:
            error instanceof Error ? error.message : 'Unknown error',
          auth_method: 'password_realm',
        })
        throw error
      }
    },
    [],
  )

  const signupWithEmail = useCallback(
    async (email?: string) => {
      try {
        await openExternalAuth(
          Auth0Connections.database,
          email ? { email, mode: 'signup' } : { mode: 'signup' },
        )
      } catch (error) {
        console.error('Email signup failed:', error)
        analytics.track(ANALYTICS_EVENTS.AUTH_METHOD_FAILED, {
          provider: 'email',
          error_message:
            error instanceof Error ? error.message : 'Unknown error',
          auth_method: 'external_browser',
        })
        throw error
      }
    },
    [openExternalAuth],
  )

  // Directly create a database user via Auth0 Authentication API (proxied via main to avoid CORS)
  const createDatabaseUser = useCallback(
    async (email: string, password: string, name: string) => {
      const result = await window.api.invoke('auth0-db-signup', {
        email,
        password,
        name,
      })
      if (!result?.success) {
        throw new Error(result?.error || 'Signup failed')
      }
      return result.data
    },
    [],
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

      // Hydrate per-user onboarding state
      await hydrateOnboardingState('self-hosted')

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

  // Manual token refresh
  const refreshTokens = useCallback(async () => {
    try {
      console.log('Manually refreshing tokens...')
      const result = await window.api.invoke('refresh-tokens')

      if (result.success) {
        console.log('Manual token refresh successful')
        return result
      } else {
        console.error('Manual token refresh failed:', result.error)
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error during manual token refresh:', error)
      throw error
    }
  }, [])

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
    [logout, clearAuth, auth0IsAuthenticated, authUser],
  )

  // Handle auth token events from main process
  useEffect(() => {
    if (!window.api?.on) {
      console.warn('window.api.on not available')
      return
    }

    // Check if listener is already set up
    if ((window as any).__authTokenListenerSetup) {
      return
    }

    // Mark that we've set up the listener
    ;(window as any).__authTokenListenerSetup = true

    // Handle token refresh success
    const cleanupTokensRefreshed = window.api.on(
      'tokens-refreshed',
      async (newTokens: AuthTokens) => {
        console.log('Tokens refreshed successfully, updating auth store')

        try {
          // Update the auth store with refreshed tokens
          const currentUser = authUser
          if (currentUser) {
            useAuthStore
              .getState()
              .setAuthData(newTokens, currentUser, currentUser.provider)

            // Track successful token refresh
            analytics.track(ANALYTICS_EVENTS.AUTH_SIGNIN_COMPLETED, {
              provider: currentUser.provider || 'unknown',
              user_id: currentUser.id,
              is_returning_user: true,
              reason: 'token_refresh',
            })
          }
        } catch (error) {
          console.error(
            'Error updating auth store with refreshed tokens:',
            error,
          )
        }
      },
    )

    // Handle token expiration (when refresh fails or no refresh token available)
    const cleanupTokenExpired = window.api.on(
      'auth-token-expired',
      async () => {
        console.log('Auth token expired, automatically signing out user')

        try {
          // Track automatic logout due to token expiration
          const currentUser = authUser
          analytics.trackAuth(ANALYTICS_EVENTS.AUTH_LOGOUT, {
            provider: currentUser?.provider || 'unknown',
            is_returning_user: true,
            user_id: currentUser?.id,
            complete_signout: false,
            session_duration_ms: analytics.getSessionDuration(),
            reason: 'token_expired',
          })

          logoutUser(false)

          // Auth state will automatically redirect to welcome page
        } catch (error) {
          console.error('Error during automatic logout:', error)

          // Still try to clear local auth even if main process logout fails
          clearAuth(true)
        }
      },
    )

    return () => {
      cleanupTokensRefreshed()
      cleanupTokenExpired()
      ;(window as any).__authTokenListenerSetup = false
    }
  }, [logout, clearAuth, auth0IsAuthenticated, authUser, logoutUser])

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
    loginWithEmail,
    loginWithEmailPassword,
    signupWithEmail,
    createDatabaseUser,
    loginWithSelfHosted,
    logoutUser,

    // Utilities
    getAccessToken,
    getIdTokenClaims,
    refreshTokens,
  }
}
