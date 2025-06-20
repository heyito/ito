// import dotenv from 'dotenv'
// dotenv.config()

// Auth0 configuration
export const Auth0Config = {
  domain: 'dev-8rsdprb2tatdfcps.us.auth0.com',
  clientId: 'eYuhxwH6RqMVPCjpKXU0MtEV6Yrm4Ku2',
  redirectUri: 'ito://auth/callback',
  scope: 'openid profile email',
  // Electron-specific settings
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

// Validate configuration
export const validateAuth0Config = () => {
  const required = ['domain', 'clientId', 'audience']
  const missing = required.filter(
    key => !Auth0Config[key as keyof typeof Auth0Config],
  )

  if (missing.length > 0) {
    throw new Error(`Missing Auth0 configuration: ${missing.join(', ')}`)
  }

  return true
}
