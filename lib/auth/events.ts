import store, { AuthState, createNewAuthState } from '../main/store'
import { STORE_KEYS } from '../constants/store-keys'
import mainStore from '../main/store'
import { grpcClient } from '../clients/grpcClient'
import { syncService } from '../main/syncService'
import { mainWindow } from '../main/app'
import { jwtDecode } from 'jwt-decode'

// Define TypeScript interfaces for JWT payloads
interface JwtPayload {
  exp?: number
  iat?: number
  sub?: string
  email?: string
  name?: string
  picture?: string
  iss?: string
  aud?: string | string[]
  [key: string]: any
}

// Utility function to check if a JWT token is expired
export const isTokenExpired = (token: string): boolean => {
  try {
    const payload = jwtDecode<JwtPayload>(token)

    // Check if token has expired
    const currentTime = Math.floor(Date.now() / 1000)
    return payload.exp ? payload.exp < currentTime : true
  } catch (error) {
    console.warn('Failed to decode token for expiration check:', error)
    // If we can't decode the token, assume it's expired to be safe
    return true
  }
}

// Check and validate stored tokens on startup
export const validateStoredTokens = async (config?: any) => {
  try {
    const storedAuth = store.get(STORE_KEYS.AUTH)
    const storedTokens = storedAuth?.tokens
    const mainStoreAccessToken = mainStore.get(STORE_KEYS.ACCESS_TOKEN) as
      | string
      | undefined

    // Check if we have tokens to validate
    const hasTokens = storedTokens?.access_token || mainStoreAccessToken

    if (hasTokens) {
      console.log('Checking stored access tokens for expiration...')

      // First, ensure tokens match current environment (issuer/audience)
      const tokenToCheck = mainStoreAccessToken || storedTokens?.access_token
      if (config && tokenToCheck) {
        let envMismatch = false
        try {
          const payload = jwtDecode<JwtPayload>(tokenToCheck)
          const issuer = payload.iss || ''
          const audience = payload.aud

          // Determine expected issuer host from config.domain
          const expectedDomain = (config.domain || '').toString().trim()
          let issuerMatches = false
          try {
            const issUrl = new URL(issuer)
            issuerMatches =
              !!expectedDomain &&
              issUrl.host.toLowerCase() === expectedDomain.toLowerCase()
          } catch {
            // If issuer is not a URL, do a loose contains match
            issuerMatches = !!expectedDomain && issuer.includes(expectedDomain)
          }

          // Audience can be string or array
          let audienceMatches = true
          if (config.audience) {
            const expectedAudience = config.audience.toString().trim()
            const audiences = Array.isArray(audience)
              ? audience
              : audience
                ? [audience]
                : []
            audienceMatches = audiences.some(a => a === expectedAudience)
          }

          envMismatch = !issuerMatches || !audienceMatches
        } catch (e) {
          // If we fail to decode for env check, treat as mismatch to be safe
          envMismatch = true
        }

        if (envMismatch) {
          console.log(
            'Stored access token does not match current environment, clearing auth data',
          )

          // Clear auth store tokens
          if (storedAuth) {
            store.set(STORE_KEYS.AUTH, {
              ...storedAuth,
              tokens: null,
            })
          }

          // Clear gRPC client token and stop sync
          grpcClient.setAuthToken(null)
          syncService.stop()

          // Clear main process store
          mainStore.delete(STORE_KEYS.USER_PROFILE)
          mainStore.delete(STORE_KEYS.ID_TOKEN)
          mainStore.delete(STORE_KEYS.ACCESS_TOKEN)

          // Notify renderer process about token expiration/mismatch
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('auth-token-expired')
          }

          return false
        }
      }

      // Check both token sources
      const authStoreTokenExpired = storedTokens?.access_token
        ? isTokenExpired(storedTokens.access_token)
        : false
      const mainStoreTokenExpired = mainStoreAccessToken
        ? isTokenExpired(mainStoreAccessToken)
        : false

      if (authStoreTokenExpired || mainStoreTokenExpired) {
        console.log('Stored access tokens are expired')

        // Try to refresh tokens if we have a refresh token and config
        if (storedTokens?.refresh_token && config) {
          console.log('Attempting to refresh expired tokens...')

          const refreshResult = await ensureValidTokens(config)

          if (refreshResult.success) {
            console.log('Successfully refreshed expired tokens')
            return true
          } else {
            console.log('Token refresh failed, clearing auth data')
          }
        } else {
          console.log('No refresh token available, clearing auth data')
        }

        // Clear expired tokens from auth store
        if (storedAuth) {
          store.set(STORE_KEYS.AUTH, {
            ...storedAuth,
            tokens: null,
          })
        }

        // Clear gRPC client token
        grpcClient.setAuthToken(null)

        // Stop sync service
        syncService.stop()

        // Clear main process store
        mainStore.delete(STORE_KEYS.USER_PROFILE)
        mainStore.delete(STORE_KEYS.ID_TOKEN)
        mainStore.delete(STORE_KEYS.ACCESS_TOKEN)

        // Notify renderer process about token expiration
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auth-token-expired')
        } else {
          // If main window isn't created yet, we'll need to notify it later
          // The renderer will handle this when it initializes
          console.log(
            'Main window not available yet, token expiration will be handled on renderer init',
          )
        }

        return false // Tokens were invalid
      } else {
        console.log('Stored access tokens are valid')

        // Ensure both stores are in sync
        if (storedTokens?.access_token && !mainStoreAccessToken) {
          mainStore.set(STORE_KEYS.ACCESS_TOKEN, storedTokens.access_token)
        } else if (mainStoreAccessToken && !storedTokens?.access_token) {
          // Update auth store with main store token
          if (storedAuth) {
            store.set(STORE_KEYS.AUTH, {
              ...storedAuth,
              tokens: {
                ...storedAuth.tokens,
                access_token: mainStoreAccessToken,
              },
            })
          }
        }

        return true // Tokens are valid
      }
    }

    return true // No tokens to validate
  } catch (error) {
    console.error('Error validating stored tokens:', error)
    return false // Assume invalid on error
  }
}

export const generateNewAuthState = (): AuthState => {
  const newAuthState = createNewAuthState()

  // Update the auth state in the store
  const currentAuth = store.get(STORE_KEYS.AUTH)
  store.set(STORE_KEYS.AUTH, {
    ...currentAuth,
    state: newAuthState,
  })

  return newAuthState
}

// Auth token exchange
export const exchangeAuthCode = async (_e, { authCode, state, config }) => {
  try {
    const authStore = store.get(STORE_KEYS.AUTH)
    const codeVerifier = authStore.state?.codeVerifier
    const storedState = authStore.state?.state

    // Validate state parameter
    if (storedState !== state) {
      throw new Error(`State mismatch: expected ${storedState}, got ${state}`)
    }

    if (!codeVerifier) {
      throw new Error('Code verifier not found in store')
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: authCode,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    })

    // Add audience if present in config
    if (config.audience) {
      tokenParams.append('audience', config.audience)
    }

    const response = await fetch(`https://${config.domain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Token exchange failed:')
      console.error('Status:', response.status)
      console.error('Status Text:', response.statusText)
      console.error('Response:', errorText)
      console.error('Request params:', tokenParams.toString())

      throw new Error(
        `Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`,
      )
    }

    const tokens = await response.json()

    // Extract user info from ID token if available
    let userInfo: any = null
    if (tokens.id_token) {
      try {
        const payload = jwtDecode<JwtPayload>(tokens.id_token)
        userInfo = {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
        }
      } catch (jwtError) {
        console.warn('Failed to decode ID token:', jwtError)
      }
    }

    return {
      success: true,
      tokens,
      userInfo,
    }
  } catch (error) {
    console.error('Token exchange error in main process:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export const handleLogin = (
  profile: any,
  idToken: string | null,
  accessToken: string | null,
) => {
  mainStore.set(STORE_KEYS.USER_PROFILE, profile)

  if (idToken) {
    mainStore.set(STORE_KEYS.ID_TOKEN, idToken)
  }

  if (accessToken) {
    mainStore.set(STORE_KEYS.ACCESS_TOKEN, accessToken)
    grpcClient.setAuthToken(accessToken)
    syncService.start()
  }

  // For self-hosted users, we don't start sync service since they don't have tokens
}

export const handleLogout = () => {
  mainStore.delete(STORE_KEYS.USER_PROFILE)
  mainStore.delete(STORE_KEYS.ID_TOKEN)
  mainStore.delete(STORE_KEYS.ACCESS_TOKEN)
  grpcClient.setAuthToken(null)
  syncService.stop()
}

export const refreshTokens = async (refreshToken: string, config: any) => {
  try {
    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
    })

    // Add audience if present in config
    if (config.audience) {
      tokenParams.append('audience', config.audience)
    }

    const response = await fetch(`https://${config.domain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Token refresh failed:', response.status, errorText)
      throw new Error(
        `Token refresh failed: ${response.status} ${response.statusText}`,
      )
    }

    const tokens = await response.json()

    // Calculate expiration time
    const expiresAt = Date.now() + tokens.expires_in * 1000

    return {
      success: true,
      tokens: {
        ...tokens,
        expires_at: expiresAt,
        // Keep the original refresh token if not provided in response
        refresh_token: tokens.refresh_token || refreshToken,
      },
    }
  } catch (error) {
    console.error('Token refresh error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Check if token needs refresh (refresh 5 minutes before expiry)
export const shouldRefreshToken = (expiresAt: number): boolean => {
  const fiveMinutes = 5 * 60 * 1000 // 5 minutes in milliseconds
  return Date.now() >= expiresAt - fiveMinutes
}

// Automatically refresh tokens if needed
export const ensureValidTokens = async (config: any) => {
  const storedAuth = store.get(STORE_KEYS.AUTH)
  const tokens = storedAuth?.tokens

  if (!tokens || !tokens.refresh_token) {
    return { success: false, error: 'No refresh token available' }
  }

  // Check if token needs refresh
  if (tokens.expires_at && shouldRefreshToken(tokens.expires_at)) {
    console.log('Access token needs refresh, refreshing...')

    const refreshResult = await refreshTokens(tokens.refresh_token, config)

    if (refreshResult.success) {
      // Update stored tokens
      const updatedAuth = {
        ...storedAuth,
        tokens: refreshResult.tokens,
      }

      store.set(STORE_KEYS.AUTH, updatedAuth)

      // Update main store
      if (refreshResult.tokens.access_token) {
        mainStore.set(
          STORE_KEYS.ACCESS_TOKEN,
          refreshResult.tokens.access_token,
        )
        grpcClient.setAuthToken(refreshResult.tokens.access_token)
      }

      // Notify renderer about token refresh
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tokens-refreshed', refreshResult.tokens)
      }

      return { success: true, tokens: refreshResult.tokens }
    } else {
      // Refresh failed, clear auth data
      console.log('Token refresh failed, clearing auth data')
      handleLogout()

      // Clear auth store
      store.set(STORE_KEYS.AUTH, {
        ...storedAuth,
        tokens: null,
        isAuthenticated: false,
      })

      // Notify renderer about token expiration
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth-token-expired')
      }

      return refreshResult
    }
  }

  return { success: true, tokens }
}
