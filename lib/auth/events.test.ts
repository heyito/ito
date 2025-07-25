import { describe, test, expect, mock, beforeEach } from 'bun:test'
import {
  shouldRefreshToken,
  isTokenExpired,
  exchangeAuthCode,
  handleLogin,
  handleLogout,
  refreshTokens,
  ensureValidTokens,
} from './events'

// Mock jwt-decode for testing token expiration logic
const mockJwtDecode = mock()
mock.module('jwt-decode', () => ({
  jwtDecode: mockJwtDecode,
}))

// Mock store - used by both exchangeAuthCode and handleLogin
const mockStore = {
  get: mock(),
  set: mock(),
  delete: mock(),
}
mock.module('../main/store', () => ({
  default: mockStore,
}))

// Mock gRPC client
const mockGrpcClient = {
  setAuthToken: mock(),
}
mock.module('../clients/grpcClient', () => ({
  grpcClient: mockGrpcClient,
}))

// Mock sync service
const mockSyncService = {
  start: mock(),
  stop: mock(),
}
mock.module('../main/syncService', () => ({
  syncService: mockSyncService,
}))

// Mock main window for notifications
const mockMainWindow = {
  isDestroyed: mock().mockReturnValue(false),
  webContents: {
    send: mock(),
  },
}
mock.module('../main/app', () => ({
  mainWindow: mockMainWindow,
}))

// Mock store keys
mock.module('../constants/store-keys', () => ({
  STORE_KEYS: {
    USER_PROFILE: 'userProfile',
    ID_TOKEN: 'idToken',
    ACCESS_TOKEN: 'accessToken',
    AUTH: 'auth',
  },
}))

// Mock fetch for network calls
const mockFetch = mock()
global.fetch = mockFetch as any

describe('Authentication Events', () => {
  beforeEach(() => {
    mockJwtDecode.mockClear()
    mockStore.get.mockClear()
    mockStore.set.mockClear()
    mockStore.delete.mockClear()
    mockGrpcClient.setAuthToken.mockClear()
    mockSyncService.start.mockClear()
    mockSyncService.stop.mockClear()
    mockMainWindow.isDestroyed.mockClear()
    mockMainWindow.webContents.send.mockClear()
    mockFetch.mockClear()
  })

  describe('shouldRefreshToken', () => {
    test('should return true when token expires within 5 minutes', () => {
      const fourMinutesFromNow = Date.now() + 4 * 60 * 1000

      expect(shouldRefreshToken(fourMinutesFromNow)).toBe(true)
    })

    test('should return false when token expires after 5 minutes', () => {
      const sixMinutesFromNow = Date.now() + 6 * 60 * 1000

      expect(shouldRefreshToken(sixMinutesFromNow)).toBe(false)
    })

    test('should return true for already expired tokens', () => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000

      expect(shouldRefreshToken(oneHourAgo)).toBe(true)
    })

    test('should return true at exactly 5 minute boundary', () => {
      const exactlyFiveMinutes = Date.now() + 5 * 60 * 1000

      expect(shouldRefreshToken(exactlyFiveMinutes)).toBe(true)
    })

    test('should handle edge case at boundary', () => {
      const almostFiveMinutes = Date.now() + 5 * 60 * 1000 - 1

      expect(shouldRefreshToken(almostFiveMinutes)).toBe(true)
    })
  })

  describe('isTokenExpired', () => {
    beforeEach(() => {
      mockJwtDecode.mockClear()
    })

    test('should return false for valid non-expired token', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      mockJwtDecode.mockReturnValue({ exp: futureExp })

      expect(isTokenExpired('valid-token')).toBe(false)
    })

    test('should return true for expired token', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      mockJwtDecode.mockReturnValue({ exp: pastExp })

      expect(isTokenExpired('expired-token')).toBe(true)
    })

    test('should return true for token without exp field', () => {
      mockJwtDecode.mockReturnValue({ sub: 'user-123' }) // No exp field

      expect(isTokenExpired('token-without-exp')).toBe(true)
    })

    test('should return true when JWT decode fails', () => {
      mockJwtDecode.mockImplementation(() => {
        throw new Error('Invalid JWT')
      })

      expect(isTokenExpired('malformed-token')).toBe(true)
    })

    test('should handle token at exact expiration boundary', () => {
      const currentTime = Math.floor(Date.now() / 1000)
      mockJwtDecode.mockReturnValue({ exp: currentTime })

      expect(isTokenExpired('boundary-token')).toBe(false)
    })
  })

  describe('exchangeAuthCode business logic', () => {
    test('should reject mismatched state parameter (CSRF protection)', async () => {
      // Setup: Store has one state, request has different state
      mockStore.get.mockReturnValue({
        state: {
          codeVerifier: 'valid-verifier',
          state: 'stored-state-123',
        },
      })

      const result = await exchangeAuthCode(
        {},
        {
          authCode: 'valid-code',
          state: 'different-state-456', // Mismatch!
          config: {
            domain: 'test.auth0.com',
            clientId: 'client123',
            redirectUri: 'http://localhost/callback',
          },
        },
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('State mismatch')
      expect(mockFetch).not.toHaveBeenCalled() // Should not make network call
    })

    test('should reject missing code verifier (PKCE requirement)', async () => {
      // Setup: Store missing code verifier
      mockStore.get.mockReturnValue({
        state: {
          state: 'matching-state',
          // codeVerifier is missing - PKCE violation
        },
      })

      const result = await exchangeAuthCode(
        {},
        {
          authCode: 'valid-code',
          state: 'matching-state',
          config: {
            domain: 'test.auth0.com',
            clientId: 'client123',
            redirectUri: 'http://localhost/callback',
          },
        },
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Code verifier not found')
      expect(mockFetch).not.toHaveBeenCalled() // Should not make network call
    })

    test('should handle network errors gracefully', async () => {
      // Setup: Valid auth state
      mockStore.get.mockReturnValue({
        state: {
          codeVerifier: 'valid-verifier',
          state: 'matching-state',
        },
      })

      // Mock network failure
      mockFetch.mockRejectedValue(new Error('Network timeout'))

      const result = await exchangeAuthCode(
        {},
        {
          authCode: 'valid-code',
          state: 'matching-state',
          config: {
            domain: 'test.auth0.com',
            clientId: 'client123',
            redirectUri: 'http://localhost/callback',
          },
        },
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network timeout')
    })

    test('should handle Auth0 API errors gracefully', async () => {
      // Setup: Valid auth state
      mockStore.get.mockReturnValue({
        state: {
          codeVerifier: 'valid-verifier',
          state: 'matching-state',
        },
      })

      // Mock Auth0 error response
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: mock().mockResolvedValue('invalid_grant: Code has expired'),
      })

      const result = await exchangeAuthCode(
        {},
        {
          authCode: 'expired-code',
          state: 'matching-state',
          config: {
            domain: 'test.auth0.com',
            clientId: 'client123',
            redirectUri: 'http://localhost/callback',
          },
        },
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Token exchange failed')
    })
  })

  describe('handleLogin business logic', () => {
    const testProfile = {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    }

    test('should always store user profile regardless of token presence', () => {
      handleLogin(testProfile, null, null)

      expect(mockStore.set).toHaveBeenCalledWith('userProfile', testProfile)
    })

    test('should store both tokens when both are provided', () => {
      const idToken = 'id-token-123'
      const accessToken = 'access-token-123'

      handleLogin(testProfile, idToken, accessToken)

      expect(mockStore.set).toHaveBeenCalledWith('userProfile', testProfile)
      expect(mockStore.set).toHaveBeenCalledWith('idToken', idToken)
      expect(mockStore.set).toHaveBeenCalledWith('accessToken', accessToken)
    })

    test('should only store ID token when access token is null', () => {
      const idToken = 'id-token-123'

      handleLogin(testProfile, idToken, null)

      expect(mockStore.set).toHaveBeenCalledWith('userProfile', testProfile)
      expect(mockStore.set).toHaveBeenCalledWith('idToken', idToken)
      expect(mockStore.set).not.toHaveBeenCalledWith(
        'accessToken',
        expect.anything(),
      )

      // Should not start services without access token
      expect(mockGrpcClient.setAuthToken).not.toHaveBeenCalled()
      expect(mockSyncService.start).not.toHaveBeenCalled()
    })

    test('should only store access token when ID token is null', () => {
      const accessToken = 'access-token-123'

      handleLogin(testProfile, null, accessToken)

      expect(mockStore.set).toHaveBeenCalledWith('userProfile', testProfile)
      expect(mockStore.set).not.toHaveBeenCalledWith(
        'idToken',
        expect.anything(),
      )
      expect(mockStore.set).toHaveBeenCalledWith('accessToken', accessToken)

      // Should start services with access token
      expect(mockGrpcClient.setAuthToken).toHaveBeenCalledWith(accessToken)
      expect(mockSyncService.start).toHaveBeenCalled()
    })

    test('should setup services only when access token is present', () => {
      const accessToken = 'access-token-123'

      handleLogin(testProfile, 'id-token', accessToken)

      // Services should be configured with access token
      expect(mockGrpcClient.setAuthToken).toHaveBeenCalledWith(accessToken)
      expect(mockSyncService.start).toHaveBeenCalled()
    })

    test('should not setup services when no access token provided', () => {
      handleLogin(testProfile, 'id-token', null)

      // Services should not be started
      expect(mockGrpcClient.setAuthToken).not.toHaveBeenCalled()
      expect(mockSyncService.start).not.toHaveBeenCalled()
    })

    test('should setup services in correct order when access token present', () => {
      const accessToken = 'access-token-123'

      handleLogin(testProfile, 'id-token', accessToken)

      // Verify order: store profile, store tokens, then setup services
      const calls = mockStore.set.mock.calls
      expect(calls[0]).toEqual(['userProfile', testProfile])
      expect(calls[1]).toEqual(['idToken', 'id-token'])
      expect(calls[2]).toEqual(['accessToken', accessToken])

      // Service setup should happen after token storage
      expect(mockGrpcClient.setAuthToken).toHaveBeenCalledWith(accessToken)
      expect(mockSyncService.start).toHaveBeenCalled()
    })
  })

  describe('handleLogout business logic', () => {
    test('should clear all auth data and stop services', () => {
      handleLogout()

      // Should delete all stored auth data
      expect(mockStore.delete).toHaveBeenCalledWith('userProfile')
      expect(mockStore.delete).toHaveBeenCalledWith('idToken')
      expect(mockStore.delete).toHaveBeenCalledWith('accessToken')

      // Should clear gRPC auth and stop sync service
      expect(mockGrpcClient.setAuthToken).toHaveBeenCalledWith(null)
      expect(mockSyncService.stop).toHaveBeenCalled()
    })
  })

  describe('refreshTokens business logic', () => {
    const testConfig = { domain: 'test.auth0.com', clientId: 'client123' }

    test('should calculate expiration timestamp correctly', async () => {
      const beforeCall = Date.now()
      const expiresInSeconds = 3600 // 1 hour

      mockFetch.mockResolvedValue({
        ok: true,
        json: mock().mockResolvedValue({
          access_token: 'new-access-token',
          expires_in: expiresInSeconds,
        }),
      })

      const result = await refreshTokens('refresh-token-123', testConfig)
      const afterCall = Date.now()

      expect(result.success).toBe(true)

      // Expiration should be approximately now + expires_in seconds
      const expectedMin = beforeCall + expiresInSeconds * 1000
      const expectedMax = afterCall + expiresInSeconds * 1000

      expect(result.tokens.expires_at).toBeGreaterThanOrEqual(expectedMin)
      expect(result.tokens.expires_at).toBeLessThanOrEqual(expectedMax)
    })

    test('should preserve original refresh token when new one not provided', async () => {
      const originalRefreshToken = 'original-refresh-token'

      mockFetch.mockResolvedValue({
        ok: true,
        json: mock().mockResolvedValue({
          access_token: 'new-access-token',
          expires_in: 3600,
          // No refresh_token in response
        }),
      })

      const result = await refreshTokens(originalRefreshToken, testConfig)

      expect(result.success).toBe(true)
      expect(result.tokens.refresh_token).toBe(originalRefreshToken)
    })

    test('should use new refresh token when provided in response', async () => {
      const newRefreshToken = 'new-refresh-token'

      mockFetch.mockResolvedValue({
        ok: true,
        json: mock().mockResolvedValue({
          access_token: 'new-access-token',
          expires_in: 3600,
          refresh_token: newRefreshToken,
        }),
      })

      const result = await refreshTokens('old-refresh-token', testConfig)

      expect(result.success).toBe(true)
      expect(result.tokens.refresh_token).toBe(newRefreshToken)
    })

    test('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network connection failed'))

      const result = await refreshTokens('refresh-token-123', testConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network connection failed')
    })

    test('should handle Auth0 API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: mock().mockResolvedValue('invalid_grant'),
      })

      const result = await refreshTokens('invalid-refresh-token', testConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Token refresh failed')
    })

    test('should handle unknown errors gracefully', async () => {
      mockFetch.mockRejectedValue('Some weird error object')

      const result = await refreshTokens('refresh-token-123', testConfig)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
    })
  })

  describe('ensureValidTokens business logic', () => {
    const testConfig = { domain: 'test.auth0.com', clientId: 'client123' }

    test('should return error when no stored auth exists', async () => {
      mockStore.get.mockReturnValue(null)

      const result = await ensureValidTokens(testConfig)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No refresh token available')
    })

    test('should return error when no tokens exist', async () => {
      mockStore.get.mockReturnValue({ someOtherData: 'value' })

      const result = await ensureValidTokens(testConfig)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No refresh token available')
    })

    test('should return error when no refresh token exists', async () => {
      mockStore.get.mockReturnValue({
        tokens: {
          access_token: 'access-token',
          expires_at: Date.now() + 10 * 60 * 1000,
          // No refresh_token
        },
      })

      const result = await ensureValidTokens(testConfig)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No refresh token available')
    })

    test('should return existing tokens when no refresh needed', async () => {
      const validTokens = {
        access_token: 'valid-access-token',
        refresh_token: 'refresh-token',
        expires_at: Date.now() + 10 * 60 * 1000, // 10 minutes - no refresh needed
      }

      mockStore.get.mockReturnValue({
        tokens: validTokens,
        isAuthenticated: true,
      })

      const result: any = await ensureValidTokens(testConfig)

      expect(result.success).toBe(true)
      expect(result.tokens).toBe(validTokens)
      expect(mockFetch).not.toHaveBeenCalled() // Should not attempt refresh
    })

    test('should orchestrate successful token refresh', async () => {
      const expiringTokens = {
        access_token: 'expiring-access-token',
        refresh_token: 'refresh-token',
        expires_at: Date.now() + 2 * 60 * 1000, // 2 minutes - needs refresh
      }

      const storedAuth = {
        tokens: expiringTokens,
        isAuthenticated: true,
        userId: 'user-123',
      }

      mockStore.get.mockReturnValue(storedAuth)
      mockFetch.mockResolvedValue({
        ok: true,
        json: mock().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      })

      const result = await ensureValidTokens(testConfig)

      expect(result.success).toBe(true)

      // Should update auth store with new tokens
      expect(mockStore.set).toHaveBeenCalledWith('auth', {
        ...storedAuth,
        tokens: expect.objectContaining({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
        }),
      })

      // Should update main store with new access token
      expect(mockStore.set).toHaveBeenCalledWith(
        'accessToken',
        'new-access-token',
      )

      // Should update gRPC client
      expect(mockGrpcClient.setAuthToken).toHaveBeenCalledWith(
        'new-access-token',
      )

      // Should notify renderer
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'tokens-refreshed',
        expect.objectContaining({
          access_token: 'new-access-token',
        }),
      )
    })

    test('should orchestrate cleanup when refresh fails', async () => {
      const expiringTokens = {
        access_token: 'expiring-access-token',
        refresh_token: 'invalid-refresh-token',
        expires_at: Date.now() + 2 * 60 * 1000,
      }

      const storedAuth = {
        tokens: expiringTokens,
        isAuthenticated: true,
      }

      mockStore.get.mockReturnValue(storedAuth)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: mock().mockResolvedValue('invalid_grant'),
      })

      const result = await ensureValidTokens(testConfig)

      expect(result.success).toBe(false)

      // Should clear auth data (logout orchestration)
      expect(mockStore.delete).toHaveBeenCalledWith('userProfile')
      expect(mockStore.delete).toHaveBeenCalledWith('idToken')
      expect(mockStore.delete).toHaveBeenCalledWith('accessToken')
      expect(mockGrpcClient.setAuthToken).toHaveBeenCalledWith(null)
      expect(mockSyncService.stop).toHaveBeenCalled()

      // Should clear auth store
      expect(mockStore.set).toHaveBeenCalledWith('auth', {
        ...storedAuth,
        tokens: null,
        isAuthenticated: false,
      })

      // Should notify renderer about expiration
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'auth-token-expired',
      )
    })

    test('should handle missing expires_at gracefully', async () => {
      const tokensWithoutExpiry = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        // No expires_at field
      }

      mockStore.get.mockReturnValue({
        tokens: tokensWithoutExpiry,
      })

      const result: any = await ensureValidTokens(testConfig)

      expect(result.success).toBe(true)
      expect(result.tokens).toBe(tokensWithoutExpiry)
      expect(mockFetch).not.toHaveBeenCalled() // Should not attempt refresh
    })
  })
})
