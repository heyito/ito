import dotenv from 'dotenv'
dotenv.config()

// Auth0 configuration
export const Auth0Config = {
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_CLIENT_ID,
  audience: process.env.AUTH0_AUDIENCE,
  redirectUri: process.env.AUTH0_REDIRECT_URI,
  scope: 'openid profile email',
}
