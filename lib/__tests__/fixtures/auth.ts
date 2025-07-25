// JWT token fixtures for testing
export const VALID_JWT_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwibmFtZSI6IlRlc3QgVXNlciIsInBpY3R1cmUiOiJodHRwczovL2V4YW1wbGUuY29tL2F2YXRhci5qcGciLCJpYXQiOjE3MzUzNDk4ODAsImV4cCI6OTk5OTk5OTk5OX0.fake-signature'

export const EXPIRED_JWT_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwibmFtZSI6IlRlc3QgVXNlciIsInBpY3R1cmUiOiJodHRwczovL2V4YW1wbGUuY29tL2F2YXRhci5qcGciLCJpYXQiOjE3MzUzNDk4ODAsImV4cCI6MTczNTM0OTg4MH0.fake-signature'

export const MALFORMED_JWT_TOKEN = 'invalid.jwt.token'

// Auth0 configuration fixtures
export const VALID_AUTH0_CONFIG = {
  domain: 'test-domain.auth0.com',
  clientId: 'test-client-id',
  audience: 'https://api.test.com',
  redirectUri: 'http://localhost:3000/callback',
  scope: 'openid profile email offline_access',
  useRefreshTokens: true,
  cacheLocation: 'localstorage' as const,
}

export const INCOMPLETE_AUTH0_CONFIG = {
  domain: 'test-domain.auth0.com',
  clientId: '', // Missing client ID
  audience: 'https://api.test.com',
  redirectUri: 'http://localhost:3000/callback',
}

// Token response fixtures
export const VALID_TOKEN_RESPONSE = {
  access_token: VALID_JWT_TOKEN,
  id_token: VALID_JWT_TOKEN,
  refresh_token: 'refresh-token-123',
  token_type: 'Bearer',
  expires_in: 86400,
}

export const REFRESH_TOKEN_RESPONSE = {
  access_token: VALID_JWT_TOKEN,
  id_token: VALID_JWT_TOKEN,
  token_type: 'Bearer',
  expires_in: 86400,
  // Note: refresh_token may or may not be included in refresh response
}

export const TOKEN_ERROR_RESPONSE = {
  error: 'invalid_grant',
  error_description: 'The refresh token is invalid',
}

// User profile fixtures
export const SAMPLE_USER_PROFILE = {
  id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.jpg',
  email_verified: true,
  updated_at: '2024-01-01T00:00:00.000Z',
}

export const SAMPLE_USER_PROFILE_MINIMAL = {
  id: 'test-user-456',
  email: 'minimal@example.com',
}

// Auth state fixtures
export const SAMPLE_AUTH_STATE = {
  id: 'test-auth-state-id-123',
  state: 'random-state-string-123',
  codeVerifier: 'code-verifier-123',
  codeChallenge: 'code-challenge-123',
}

export const SAMPLE_STORED_AUTH = {
  isAuthenticated: true,
  tokens: {
    access_token: VALID_JWT_TOKEN,
    id_token: VALID_JWT_TOKEN,
    refresh_token: 'refresh-token-123',
    expires_at: Date.now() + 86400000, // 24 hours from now
  },
  state: SAMPLE_AUTH_STATE,
  userProfile: SAMPLE_USER_PROFILE,
}

export const SAMPLE_EXPIRED_AUTH = {
  isAuthenticated: true,
  tokens: {
    access_token: EXPIRED_JWT_TOKEN,
    id_token: EXPIRED_JWT_TOKEN,
    refresh_token: 'refresh-token-123',
    expires_at: Date.now() - 3600000, // 1 hour ago
  },
  state: SAMPLE_AUTH_STATE,
  userProfile: SAMPLE_USER_PROFILE,
}

// Network response mocks
export const createSuccessfulTokenResponse = (overrides = {}) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => ({ ...VALID_TOKEN_RESPONSE, ...overrides }),
})

export const createFailedTokenResponse = (
  status = 400,
  error = TOKEN_ERROR_RESPONSE,
) => ({
  ok: false,
  status,
  statusText: status === 400 ? 'Bad Request' : 'Internal Server Error',
  text: async () => JSON.stringify(error),
})

// Environment variable mocks for Auth0 config
export const VALID_ENV_VARS = {
  VITE_AUTH0_DOMAIN: 'test-domain.auth0.com',
  VITE_AUTH0_CLIENT_ID: 'test-client-id',
  VITE_AUTH0_AUDIENCE: 'https://api.test.com',
  VITE_AUTH0_REDIRECT_URI: 'http://localhost:3000/callback',
}

export const INCOMPLETE_ENV_VARS = {
  VITE_AUTH0_DOMAIN: 'test-domain.auth0.com',
  VITE_AUTH0_CLIENT_ID: '', // Missing
  VITE_AUTH0_AUDIENCE: 'https://api.test.com',
  VITE_AUTH0_REDIRECT_URI: '', // Missing
}

// Helper functions
export const createTokensWithExpiry = (expiresInMinutes: number) => ({
  ...VALID_TOKEN_RESPONSE,
  expires_at: Date.now() + expiresInMinutes * 60 * 1000,
})

export const createJWTWithExpiry = (expiresInSeconds: number) => {
  const payload = {
    sub: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }

  // Simple base64 encoding for testing (not a real JWT signature)
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadEncoded = btoa(JSON.stringify(payload))
  return `${header}.${payloadEncoded}.fake-signature`
}
