import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock crypto module, preserving Node's built-ins used by dependencies like `uuid`
const realCrypto = require('node:crypto')
const mockCryptoPartial = {
  ...realCrypto,
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

const mockCrypto = mockCryptoPartial

mock.module('crypto', () => ({
  default: mockCryptoPartial,
  ...mockCryptoPartial,
}))

// Mock console to avoid noise
beforeEach(() => {
  console.log = mock()
  console.error = mock()
})

describe('KV-backed Store', () => {
  beforeEach(() => {
    // Clear module cache for fresh imports
    delete require.cache[require.resolve('./store')]
  })

  test('should expose default values on first load', async () => {
    const { default: store } = await import('./store')
    const settings = store.get('settings')
    expect(settings.shareAnalytics).toBe(true)
    expect(settings.launchAtLogin).toBe(true)
    expect(settings.isShortcutGloballyEnabled).toBe(false)
    const main = store.get('main')
    expect(main.navExpanded).toBe(true)
  })

  test('dot-path set should update nested value', async () => {
    const { default: store } = await import('./store')
    store.set('settings.launchAtLogin', false)
    const settings = store.get('settings')
    expect(settings.launchAtLogin).toBe(false)
  })

  test('delete should clear top-level key', async () => {
    const { default: store } = await import('./store')
    store.set('main', { navExpanded: false })
    expect(store.get('main').navExpanded).toBe(false)
    store.delete('main')
    expect(store.get('main')).toBeUndefined()
  })
})

describe('Auth helpers', () => {
  test('getCurrentUserId should read from userProfile', async () => {
    const { default: store, getCurrentUserId } = await import('./store')
    store.set('userProfile', { id: 'user-123', name: 'T' })
    expect(getCurrentUserId()).toBe('user-123')
  })

  test('createNewAuthState should use crypto functions', async () => {
    const { createNewAuthState } = await import('./store')
    const s = createNewAuthState()
    expect(mockCrypto.randomBytes).toHaveBeenCalledWith(32)
    expect(mockCrypto.randomBytes).toHaveBeenCalledWith(16)
    expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256')
    expect(mockCrypto.randomUUID).toHaveBeenCalled()
    expect(s).toEqual({
      id: 'mock-uuid-123',
      codeVerifier: 'mock-base64url-string',
      codeChallenge: 'mock-hash-digest',
      state: 'mock-hex-string',
    })
  })
})
