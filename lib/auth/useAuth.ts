import { useAuth0 } from '@auth0/auth0-react'
import { useCallback } from 'react'
import { Auth0Connections } from './config'

export interface AuthUser {
  id: string
  email?: string
  name?: string
  picture?: string
  emailVerified?: boolean
}

export const useAuth = () => {
  const {
    loginWithRedirect,
    loginWithPopup,
    logout,
    user,
    isAuthenticated,
    isLoading,
    error,
    getAccessTokenSilently,
    getIdTokenClaims,
  } = useAuth0()

  // Convert Auth0 user to our user interface
  const authUser: AuthUser | null = user
    ? {
        id: user.sub || '',
        email: user.email,
        name: user.name,
        picture: user.picture,
        emailVerified: user.email_verified,
      }
    : null

  // External browser authentication - now the primary method
  const openExternalAuth = useCallback(
    async (
      connection?: string,
      options?: { email?: string; mode?: 'login' | 'signup' },
    ) => {
      const { Auth0Config } = await import('./config')

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: Auth0Config.clientId,
        redirect_uri: Auth0Config.redirectUri,
        scope: Auth0Config.scope,
        prompt: 'select_account',
      })

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

  // SSO authentication - now uses external browser
  const loginWithSSO = useCallback(async () => {
    try {
      await openExternalAuth(undefined, { mode: 'login' })
    } catch (error) {
      console.error('SSO login error:', error)
      throw error
    }
  }, [openExternalAuth])

  // Get access token for API calls
  const getAccessToken = useCallback(async () => {
    try {
      return await getAccessTokenSilently()
    } catch (error) {
      console.error('Error getting access token:', error)
      throw error
    }
  }, [getAccessTokenSilently])

  // Logout
  const logoutUser = useCallback(() => {
    logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    })
  }, [logout])

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
    loginWithSSO,
    logoutUser,

    // Utilities
    getAccessToken,
    getIdTokenClaims,
  }
}
