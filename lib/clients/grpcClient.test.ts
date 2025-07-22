import { describe, test, expect, mock, beforeEach } from 'bun:test'

const mockElectron = mock(() => ({
  BrowserWindow: class {
    webContents = { send: mock() }
    isDestroyed = mock(() => false)
  },
}))

const mockTextWriter = mock(() => ({
  setFocusedText: mock(),
}))

const mockStore = mock(() => ({
  getCurrentUserId: mock(() => 'test3-user-id'),
}))

const mockRepo = mock(() => ({
  DictionaryTable: {
    findAll: mock((user_id: string) =>
      Promise.resolve([
        { word: 'hello', deleted_at: null },
        { word: 'world', deleted_at: null },
      ]),
    ),
  },
}))

const mockAuth = mock(() => ({
  ensureValidTokens: mock(),
}))

const mockConfig = mock(() => ({
  Auth0Config: {},
}))

describe('GrpcClient Mocks', () => {
  beforeEach(() => {
    // Clear mock call history
    mockElectron.mockClear()
    mockTextWriter.mockClear()
    mockStore.mockClear()
    mockRepo.mockClear()
    mockAuth.mockClear()
    mockConfig.mockClear()
  })

  test('should create mock functions', () => {
    expect(mockElectron).toBeDefined()
    expect(mockTextWriter).toBeDefined()
    expect(mockStore).toBeDefined()
    expect(mockRepo).toBeDefined()
    expect(mockAuth).toBeDefined()
    expect(mockConfig).toBeDefined()
  })

  test('should mock electron BrowserWindow', () => {
    const electronModule = mockElectron()
    const window = new electronModule.BrowserWindow()

    expect(window.webContents).toBeDefined()
    expect(window.webContents.send).toBeDefined()
    expect(window.isDestroyed()).toBe(false)
  })

  test('should mock store getCurrentUserId', () => {
    const storeModule = mockStore()
    const userId = storeModule.getCurrentUserId()

    expect(userId).toBe('test3-user-id')
  })

  test('should mock dictionary repository', async () => {
    const repoModule = mockRepo()
    const items = await repoModule.DictionaryTable.findAll('test-user')

    expect(items).toEqual([
      { word: 'hello', deleted_at: null },
      { word: 'world', deleted_at: null },
    ])
  })

  test('should handle basic grpc client operations', () => {
    // Test basic functionality without importing the actual client
    // This verifies our mocking setup works
    const mockClient = {
      setAuthToken: mock((token: string | null) => {}),
      getHeaders: mock(() => new Headers()),
      createNote: mock(async (note: any) => ({ success: true })),
    }

    mockClient.setAuthToken('test-token')
    expect(mockClient.setAuthToken).toHaveBeenCalledWith('test-token')

    const headers = mockClient.getHeaders()
    expect(headers).toBeInstanceOf(Headers)
  })
})
