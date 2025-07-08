import store, { AuthState, createNewAuthState } from '../main/store'
import mainStore from '../main/store'
import { grpcClient } from '../clients/grpcClient'
import { syncService } from '../main/syncService'

export const generateNewAuthState = (): AuthState => {
  const newAuthState = createNewAuthState()

  // Update the auth state in the store
  const currentAuth = store.get('auth')
  store.set('auth', {
    ...currentAuth,
    state: newAuthState,
  })

  return newAuthState
}

// Auth token exchange
export const exchangeAuthCode = async (_e, { authCode, state, config }) => {
  try {
    const authStore = store.get('auth')
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
        // Decode JWT payload (basic decode, no verification since it's from Auth0)
        const base64Payload = tokens.id_token.split('.')[1]
        const payload = JSON.parse(
          Buffer.from(base64Payload, 'base64').toString(),
        )
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
  console.log('handleLogin', profile, idToken, accessToken)
  mainStore.set('userProfile', profile)

  if (idToken) {
    mainStore.set('idToken', idToken)
  }

  if (accessToken) {
    mainStore.set('accessToken', accessToken)
    grpcClient.setAuthToken(accessToken)
    syncService.start()
  }

  // For self-hosted users, we don't start sync service since they don't have tokens
}

export const handleLogout = () => {
  mainStore.delete('userProfile')
  mainStore.delete('idToken')
  mainStore.delete('accessToken')
  grpcClient.setAuthToken(null)
  // We can add a syncService.stop() here if needed in the future
}
