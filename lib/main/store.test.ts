import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock electron-store module
const mockStoreInstance = {
  get: mock(),
  set: mock(),
  delete: mock(),
  clear: mock(),
  has: mock(),
  size: 0,
  store: {},
}

const MockStore = mock(function (this: any, options: any) {
  Object.assign(this, mockStoreInstance)
  this.defaults = options?.defaults || {}
  // Track the constructor call
  ;(MockStore as any)._lastOptions = options
  return mockStoreInstance
})

mock.module('electron-store', () => ({
  default: MockStore,
}))

// Mock crypto module
const mockCrypto = {
  randomBytes: mock((_size: number) => ({
    toString: mock((encoding: string) => {
      if (encoding === 'base64url') return 'mock-base64url-string'
      if (encoding === 'hex') return 'mock-hex-string'
      return 'mock-string'
    }),
  })),
  createHash: mock(() => ({
    update: mock(() => ({
      digest: mock(() => 'mock-hash-digest'),
    })),
  })),
  randomUUID: mock(() => 'mock-uuid-123'),
}

mock.module('crypto', () => ({
  default: mockCrypto,
  ...mockCrypto,
}))

// Mock store keys
mock.module('../constants/store-keys', () => ({
  STORE_KEYS: {
    AUTH: 'auth',
    USER_PROFILE: 'userProfile',
    ID_TOKEN: 'idToken',
    ACCESS_TOKEN: 'accessToken',
    MAIN: 'main',
    ONBOARDING: 'onboarding',
    SETTINGS: 'settings',
    OPEN_MIC: 'openMic',
    SELECTED_AUDIO_INPUT: 'selectedAudioInput',
    INTERACTION_SOUNDS: 'interactionSounds',
  },
}))

// Mock console to avoid noise
beforeEach(() => {
  console.log = mock()
  console.error = mock()
})

describe('Store Management', () => {
  beforeEach(() => {
    // Clear module cache for fresh imports
    delete require.cache[require.resolve('./store')]

    // Reset all mocks
    MockStore.mockClear()
    ;(MockStore as any)._lastOptions = undefined
    Object.values(mockStoreInstance).forEach(mockFn => {
      if (typeof mockFn === 'function' && 'mockClear' in mockFn) {
        ;(mockFn as any).mockClear()
      }
    })

    // Reset crypto mocks to working state
    mockCrypto.randomBytes.mockClear()
    mockCrypto.randomBytes.mockReturnValue({
      toString: mock((encoding: string) => {
        if (encoding === 'base64url') return 'mock-base64url-string'
        if (encoding === 'hex') return 'mock-hex-string'
        return 'mock-string'
      }),
    })
    mockCrypto.createHash.mockClear()
    mockCrypto.createHash.mockReturnValue({
      update: mock(() => ({
        digest: mock(() => 'mock-hash-digest'),
      })),
    })
    mockCrypto.randomUUID.mockClear()
    mockCrypto.randomUUID.mockReturnValue('mock-uuid-123')

    // Reset mock behaviors
    mockStoreInstance.get.mockReturnValue(undefined)
    mockStoreInstance.set.mockReturnValue(undefined)
    mockStoreInstance.has.mockReturnValue(false)
  })

  describe('Store Initialization Business Logic', () => {
    test('should initialize store with default values', async () => {
      const { default: _store } = await import('./store')

      expect(MockStore).toHaveBeenCalledWith(
        expect.objectContaining({
          defaults: expect.objectContaining({
            onboarding: expect.objectContaining({
              onboardingStep: 0,
              onboardingCompleted: false,
            }),
            settings: expect.objectContaining({
              shareAnalytics: true,
              launchAtLogin: true,
              showItoBarAlways: true,
              showAppInDock: true,
              interactionSounds: false,
              muteAudioWhenDictating: false,
              microphoneDeviceId: 'default',
              microphoneName: 'Auto-detect',
              keyboardShortcuts: expect.arrayContaining([
                expect.objectContaining({
                  id: expect.any(String),
                  keys: expect.any(Array),
                  mode: expect.stringMatching(/^(transcribe|edit)$/),
                }),
              ]),
              isShortcutGloballyEnabled: false,
            }),
            main: expect.objectContaining({
              navExpanded: true,
            }),
            auth: expect.objectContaining({
              user: null,
              tokens: null,
              state: expect.any(Object),
            }),
            appliedMigrations: expect.any(Array),
          }),
        }),
      )
    })

    test('should merge default values for nested objects on initialization', async () => {
      // Mock existing partial data in store
      mockStoreInstance.get.mockImplementation((key: string) => {
        if (key === 'settings') {
          return { shareAnalytics: false } // Partial settings
        }
        if (key === 'main') {
          return { navExpanded: false } // Partial main  
        }
        if (key === 'onboarding') {
          return { onboardingCompleted: true } // Partial onboarding
        }
        if (key === 'auth') {
          return { user: { id: 'test-user' } } // Partial auth
        }
        return undefined
      })

      await import('./store')

      // Should set missing properties from defaults
      expect(mockStoreInstance.set).toHaveBeenCalledWith(
        'settings.launchAtLogin',
        true
      )
      expect(mockStoreInstance.set).toHaveBeenCalledWith(
        'onboarding.onboardingStep', 
        0
      )
    })
  })

  describe('User ID Extraction Business Logic', () => {
    test('should return user ID when user profile exists', async () => {
      const mockUserProfile = { id: 'user-123', name: 'Test User' }
      mockStoreInstance.get.mockReturnValue(mockUserProfile)

      const { getCurrentUserId } = await import('./store')
      const userId = getCurrentUserId()

      expect(mockStoreInstance.get).toHaveBeenCalledWith('userProfile')
      expect(userId).toBe('user-123')
    })

    test('should return undefined when user profile is null', async () => {
      mockStoreInstance.get.mockReturnValue(null)

      const { getCurrentUserId } = await import('./store')
      const userId = getCurrentUserId()

      expect(userId).toBeUndefined()
    })

    test('should return undefined when user profile is missing', async () => {
      mockStoreInstance.get.mockReturnValue(undefined)

      const { getCurrentUserId } = await import('./store')
      const userId = getCurrentUserId()

      expect(userId).toBeUndefined()
    })

    test('should return undefined when user profile has no ID', async () => {
      mockStoreInstance.get.mockReturnValue({ name: 'Test User' })

      const { getCurrentUserId } = await import('./store')
      const userId = getCurrentUserId()

      expect(userId).toBeUndefined()
    })

    test('should handle malformed user profile gracefully', async () => {
      mockStoreInstance.get.mockReturnValue('invalid-profile')

      const { getCurrentUserId } = await import('./store')
      const userId = getCurrentUserId()

      expect(userId).toBeUndefined()
    })
  })

  describe('Auth State Generation Business Logic', () => {
    test('should generate new auth state with crypto functions', async () => {
      const { createNewAuthState } = await import('./store')
      const authState = createNewAuthState()

      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(32)
      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(16)
      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256')
      expect(mockCrypto.randomUUID).toHaveBeenCalled()

      expect(authState).toEqual({
        id: 'mock-uuid-123',
        codeVerifier: 'mock-base64url-string',
        codeChallenge: 'mock-hash-digest',
        state: 'mock-hex-string',
      })
    })

    test('should generate unique values on each call', async () => {
      const { createNewAuthState } = await import('./store')

      // Clear the randomUUID mock after module load but before our test calls
      mockCrypto.randomUUID.mockClear()
      mockCrypto.randomUUID
        .mockReturnValueOnce('uuid-1')
        .mockReturnValueOnce('uuid-2')

      const authState1 = createNewAuthState()
      const authState2 = createNewAuthState()

      expect(authState1.id).toBe('uuid-1')
      expect(authState2.id).toBe('uuid-2')
      expect(mockCrypto.randomUUID).toHaveBeenCalledTimes(2)
    })

    test('should handle crypto function errors gracefully', async () => {
      // First load the module with working crypto
      const { createNewAuthState } = await import('./store')

      // Then break the crypto mock for this specific test
      mockCrypto.randomBytes.mockImplementation(() => {
        throw new Error('Crypto error')
      })

      expect(() => createNewAuthState()).toThrow('Crypto error')
    })
  })
})
