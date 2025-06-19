import React from 'react'
import { Auth0Provider as Auth0ReactProvider } from '@auth0/auth0-react'
import { Auth0Config, validateAuth0Config } from './config'

interface Auth0ProviderProps {
  children: React.ReactNode
}

export const Auth0Provider: React.FC<Auth0ProviderProps> = ({ children }) => {
  // Validate configuration on startup
  React.useEffect(() => {
    try {
      validateAuth0Config()
    } catch (error) {
      console.error('Auth0 configuration error:', error)
    }
  }, [])

  return (
    <Auth0ReactProvider
      domain={Auth0Config.domain}
      clientId={Auth0Config.clientId}
      authorizationParams={{
        redirect_uri: Auth0Config.redirectUri,
        audience: Auth0Config.audience,
        scope: Auth0Config.scope
      }}
      useRefreshTokens={Auth0Config.useRefreshTokens}
      cacheLocation={Auth0Config.cacheLocation}
    >
      {children}
    </Auth0ReactProvider>
  )
}

export default Auth0Provider 