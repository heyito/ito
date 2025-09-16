import { describe, test, expect, beforeEach, mock, Mock } from 'bun:test'
import { ActiveWindow } from '../media/active-application'
import { ItoMode } from '@/app/generated/ito_pb'

// Mock external dependencies to focus on core grpcClient logic
const mockElectronWindow = {
  webContents: {
    send: mock(),
    isDestroyed: mock(() => false),
  },
  isDestroyed: mock(() => false),
} as any

const mockSetFocusedText = mock()
const mockGetCurrentUserId = mock(() => 'test-user-123')
const mockDictionaryTable = {
  findAll: mock(() =>
    Promise.resolve([
      { word: 'hello', deleted_at: null },
      { word: 'world', deleted_at: null },
    ]),
  ),
}
const mockEnsureValidTokens = mock(() =>
  Promise.resolve({
    success: true,
    tokens: { access_token: 'new-token' },
  }),
)

// Mock all external modules
mock.module('electron', () => ({
  BrowserWindow: mockElectronWindow,
}))

mock.module('../media/text-writer', () => ({
  setFocusedText: mockSetFocusedText,
}))

mock.module('../main/store', () => ({
  default: { get: mock(), set: mock(), delete: mock() },
  getCurrentUserId: mockGetCurrentUserId,
  createNewAuthState: mock(() => ({
    state: 'test-state',
    codeVerifier: 'test-verifier',
  })),
  getAdvancedSettings: mock(() => ({
    llm: {
      asrModel: 'whisper-large-v3',
    },
  })),
}))

mock.module('../main/sqlite/repo', () => ({
  DictionaryTable: mockDictionaryTable,
  NotesTable: {
    insert: mock(() => Promise.resolve({ id: 'test-id' })),
    findById: mock(() => Promise.resolve(undefined)),
    findAll: mock(() => Promise.resolve([])),
    findByInteractionId: mock(() => Promise.resolve([])),
    updateContent: mock(() => Promise.resolve()),
    softDelete: mock(() => Promise.resolve()),
    deleteAllUserData: mock(() => Promise.resolve()),
    upsert: mock(() => Promise.resolve()),
    findModifiedSince: mock(() => Promise.resolve([])),
  },
  InteractionsTable: {
    insert: mock(() => Promise.resolve({ id: 'test-id' })),
    findById: mock(() => Promise.resolve(undefined)),
    findAll: mock(() => Promise.resolve([])),
    softDelete: mock(() => Promise.resolve()),
    deleteAllUserData: mock(() => Promise.resolve()),
    upsert: mock(() => Promise.resolve()),
    findModifiedSince: mock(() => Promise.resolve([])),
  },
  KeyValueStore: {
    get: mock(() => Promise.resolve(undefined)),
    set: mock(() => Promise.resolve()),
  },
}))

mock.module('../auth/events', () => ({
  ensureValidTokens: mockEnsureValidTokens,
  validateStoredTokens: mock(() => Promise.resolve(true)),
  generateNewAuthState: mock(() => ({
    state: 'test-state',
    codeVerifier: 'test-verifier',
  })),
  exchangeAuthCode: mock(() => Promise.resolve({ success: true })),
  handleLogin: mock(),
  handleLogout: mock(),
  refreshTokens: mock(() => Promise.resolve({ success: true })),
  shouldRefreshToken: mock(() => false),
}))

mock.module('../auth/config', () => ({
  Auth0Config: { domain: 'test.auth0.com' },
}))

mock.module('../media/selected-text-reader', () => ({
  getSelectedTextString: mock(() => Promise.resolve('Selected text')),
}))

const mockGetActiveWindow: Mock<() => Promise<ActiveWindow | null>> = mock(() =>
  Promise.resolve({
    title: 'Test App',
    appName: 'TestApp',
    windowId: 1,
    processId: 1234,
    positon: { x: 0, y: 0, width: 800, height: 600 },
  }),
)
mock.module('../media/active-application', () => ({
  getActiveWindow: mockGetActiveWindow,
}))

// Mock the entire gRPC stack to avoid network calls
const mockGrpcClientMethods = {
  transcribeStream: mock(() =>
    Promise.resolve({ transcript: 'test transcript' } as any),
  ),
  createNote: mock(() => Promise.resolve({ success: true } as any)),
  updateNote: mock(() => Promise.resolve({ success: true } as any)),
  deleteNote: mock(() => Promise.resolve({ success: true } as any)),
  listNotes: mock(() => Promise.resolve({ notes: [] as any })),
  createInteraction: mock(() => Promise.resolve({ success: true } as any)),
  updateInteraction: mock(() => Promise.resolve({ success: true } as any)),
  deleteInteraction: mock(() => Promise.resolve({ success: true } as any)),
  listInteractions: mock(() => Promise.resolve({ interactions: [] as any })),
  createDictionaryItem: mock(() => Promise.resolve({ success: true } as any)),
  updateDictionaryItem: mock(() => Promise.resolve({ success: true } as any)),
  deleteDictionaryItem: mock(() => Promise.resolve({ success: true } as any)),
  listDictionaryItems: mock(() => Promise.resolve({ items: [] as any })),
  deleteUserData: mock(() => Promise.resolve({ success: true } as any)),
}

mock.module('@connectrpc/connect', () => ({
  createClient: mock(() => mockGrpcClientMethods),
  ConnectError: class MockConnectError extends Error {
    code: number
    constructor(message: string, code: number) {
      super(message)
      this.code = code
    }
  },
  Code: {
    Unauthenticated: 16,
    InvalidArgument: 3,
    NotFound: 5,
    Internal: 13,
  },
}))

mock.module('@connectrpc/connect-node', () => ({
  createConnectTransport: mock(() => ({})),
}))

mock.module('@bufbuild/protobuf', () => ({
  create: mock((_schema: any, data: any) => data),
}))

// Mock protobuf schemas
mock.module('@/app/generated/ito_pb', () => ({
  ItoService: { typeName: 'ItoService' },
  // Mock all the schema objects
  CreateNoteRequestSchema: { typeName: 'CreateNoteRequest' },
  UpdateNoteRequestSchema: { typeName: 'UpdateNoteRequest' },
  DeleteNoteRequestSchema: { typeName: 'DeleteNoteRequest' },
  ListNotesRequestSchema: { typeName: 'ListNotesRequest' },
  CreateInteractionRequestSchema: { typeName: 'CreateInteractionRequest' },
  UpdateInteractionRequestSchema: { typeName: 'UpdateInteractionRequest' },
  DeleteInteractionRequestSchema: { typeName: 'DeleteInteractionRequest' },
  ListInteractionsRequestSchema: { typeName: 'ListInteractionsRequest' },
  CreateDictionaryItemRequestSchema: {
    typeName: 'CreateDictionaryItemRequest',
  },
  UpdateDictionaryItemRequestSchema: {
    typeName: 'UpdateDictionaryItemRequest',
  },
  DeleteDictionaryItemRequestSchema: {
    typeName: 'DeleteDictionaryItemRequest',
  },
  ListDictionaryItemsRequestSchema: { typeName: 'ListDictionaryItemsRequest' },
  DeleteUserDataRequestSchema: { typeName: 'DeleteUserDataRequest' },
  UpdateAdvancedSettingsRequestSchema: {
    typeName: 'UpdateAdvancedSettingsRequest',
  },
  GetAdvancedSettingsRequestSchema: { typeName: 'GetAdvancedSettingsRequest' },
}))

// Mock console to avoid noise
beforeEach(() => {
  console.log = mock()
  console.error = mock()
  console.info = mock()
})

describe('GrpcClient Business Logic Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    Object.values(mockGrpcClientMethods).forEach(mock => mock.mockClear())
    mockElectronWindow.webContents.send.mockClear()
    mockElectronWindow.isDestroyed.mockClear()
    mockSetFocusedText.mockClear()
    mockGetCurrentUserId.mockClear()
    mockDictionaryTable.findAll.mockClear()
    mockEnsureValidTokens.mockClear()
    mockGetActiveWindow.mockClear()

    // Reset default behaviors
    mockElectronWindow.isDestroyed.mockReturnValue(false)
    mockGetCurrentUserId.mockReturnValue('test-user-123')
    mockDictionaryTable.findAll.mockResolvedValue([
      { word: 'hello', deleted_at: null },
      { word: 'world', deleted_at: null },
    ])
    mockEnsureValidTokens.mockResolvedValue({
      success: true,
      tokens: { access_token: 'refreshed-token' },
    })
  })

  describe('Transcription Stream Business Logic', () => {
    test('should handle transcription stream with text output and side effects', async () => {
      const { grpcClient } = await import('./grpcClient')
      grpcClient.setAuthToken('test-token')
      grpcClient.setMainWindow(mockElectronWindow)

      const transcript = 'Hello world, this is a test'
      mockGrpcClientMethods.transcribeStream.mockResolvedValueOnce({
        transcript,
      })

      const audioStream = (async function* () {
        yield { data: new Uint8Array([1, 2, 3]) } as any
        yield { data: new Uint8Array([4, 5, 6]) } as any
      })()

      const result = await grpcClient.transcribeStream(
        audioStream,
        ItoMode.TRANSCRIBE,
      )

      expect(result.transcript).toBe(transcript)
    })

    test('should include metadata in transcription', async () => {
      const { grpcClient } = await import('./grpcClient')
      grpcClient.setAuthToken('test-token')

      const audioStream = (async function* () {
        yield { data: new Uint8Array([1, 2, 3]) } as any
      })()

      await grpcClient.transcribeStream(audioStream, ItoMode.TRANSCRIBE)

      expect(mockDictionaryTable.findAll).toHaveBeenCalledWith('test-user-123')
      expect(mockGrpcClientMethods.transcribeStream).toHaveBeenCalled()
      expect(mockGetActiveWindow).toHaveBeenCalled()
    })

    test('if window context fails to be retrieved, it should handle gracefully', async () => {
      const { grpcClient } = await import('./grpcClient')
      grpcClient.setAuthToken('test-token')

      const audioStream = (async function* () {
        yield { data: new Uint8Array([1, 2, 3]) } as any
      })()

      mockGetActiveWindow.mockResolvedValueOnce(null)

      await grpcClient.transcribeStream(audioStream, ItoMode.TRANSCRIBE)
      expect(mockGetActiveWindow).toHaveBeenCalled()
    })

    test('should handle transcription errors gracefully', async () => {
      const { grpcClient } = await import('./grpcClient')
      grpcClient.setAuthToken('test-token')
      grpcClient.setMainWindow(mockElectronWindow)

      const error = new Error('Transcription failed')
      mockGrpcClientMethods.transcribeStream.mockRejectedValueOnce(error)

      const audioStream = (async function* () {
        yield { data: new Uint8Array([1, 2, 3]) } as any
      })()

      expect(
        grpcClient.transcribeStream(audioStream, ItoMode.TRANSCRIBE),
      ).rejects.toThrow('Transcription failed')
    })

    test('should handle vocabulary fetch errors during transcription', async () => {
      const { grpcClient } = await import('./grpcClient')
      grpcClient.setAuthToken('test-token')

      mockDictionaryTable.findAll.mockRejectedValueOnce(
        new Error('Database error'),
      )

      const audioStream = (async function* () {
        yield { data: new Uint8Array([1, 2, 3]) } as any
      })()

      await grpcClient.transcribeStream(audioStream, ItoMode.TRANSCRIBE)
      expect(mockGrpcClientMethods.transcribeStream).toHaveBeenCalled()
    })
  })

  describe('Authentication', () => {
    test('should handle operations with no auth token gracefully', async () => {
      const { grpcClient } = await import('./grpcClient')
      grpcClient.setAuthToken(null)

      const testNote = {
        id: 'note-123',
        content: 'Test note',
        interaction_id: null,
        user_id: 'test-user',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        deleted_at: null,
      }

      // Should proceed with operation (empty headers but no crash)
      const result = await grpcClient.createNote(testNote)
      expect(result).toBeDefined()
    })

    test('should handle auth errors gracefully when window is destroyed', async () => {
      const { grpcClient } = await import('./grpcClient')
      grpcClient.setAuthToken('test-token')
      grpcClient.setMainWindow(mockElectronWindow)

      // Mock window as destroyed
      mockElectronWindow.isDestroyed.mockReturnValue(true)

      // Mock authentication error
      const authError = new Error('Unauthenticated')
      mockGrpcClientMethods.transcribeStream.mockRejectedValueOnce(authError)

      const audioStream = (async function* () {
        yield { data: new Uint8Array([1, 2, 3]) } as any
      })()

      // Should not crash when trying to send auth error to destroyed window
      await expect(
        grpcClient.transcribeStream(audioStream, ItoMode.TRANSCRIBE),
      ).rejects.toThrow('Unauthenticated')
      expect(mockElectronWindow.webContents.send).not.toHaveBeenCalled()
    })
  })
})
