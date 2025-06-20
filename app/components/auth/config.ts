// import dotenv from 'dotenv'
// dotenv.config()

// Auth0 configuration
export const Auth0Config = {
  domain: 'dev-8rsdprb2tatdfcps.us.auth0.com',
  clientId: 'eYuhxwH6RqMVPCjpKXU0MtEV6Yrm4Ku2',
  audience: undefined as string | undefined, // Optional audience for API access
  redirectUri: 'http://ito-public.s3-website-us-west-2.amazonaws.com',
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
  const required = ['domain', 'clientId'] // audience is optional
  const missing = required.filter(
    key => !Auth0Config[key as keyof typeof Auth0Config],
  )

  if (missing.length > 0) {
    throw new Error(`Missing Auth0 configuration: ${missing.join(', ')}`)
  }

  return true
}
