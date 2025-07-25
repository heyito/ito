// Auth0 configuration
export const Auth0Config = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN,
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
  audience: import.meta.env.VITE_AUTH0_AUDIENCE,
  redirectUri: import.meta.env.VITE_AUTH0_REDIRECT_URI,
  scope: 'openid profile email offline_access',
  useRefreshTokens: true,
  cacheLocation: 'localstorage' as const,
}

// Social connection mappings
export const Auth0Connections = {
  google: 'google-oauth2',
  microsoft: 'windowslive',
  apple: 'apple',
  github: 'github',
}

export const RequiredAuth0Fields = [
  'domain',
  'clientId',
  'redirectUri',
  'audience',
]

// Validate configuration
export const validateAuth0Config = () => {
  const missing = RequiredAuth0Fields.filter(
    key => !Auth0Config[key as keyof typeof Auth0Config],
  )

  if (missing.length > 0) {
    throw new Error(`Missing Auth0 configuration: ${missing.join(', ')}`)
  }

  return true
}
