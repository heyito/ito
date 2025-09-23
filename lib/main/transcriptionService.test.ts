import { describe, test, expect, beforeEach, mock } from 'bun:test'

const mockGrpcClient = {
  transcribeStream: mock(() =>
    Promise.resolve({ transcript: 'default' } as any),
  ),
}
mock.module('../clients/grpcClient', () => ({
  grpcClient: mockGrpcClient,
}))

const mockMainStore = {
  get: mock(),
}
mock.module('./store', () => ({
  default: mockMainStore,
  getCurrentUserId: mock(() => 'test-user-123'),
  createNewAuthState: mock(() => ({
    state: 'test-state',
    codeVerifier: 'test-verifier',
  })),
}))

const mockDbRun = mock(() => Promise.resolve())
const mockDbGet = mock(() => Promise.resolve(undefined))
const mockDbAll = mock(() => Promise.resolve([]))

mock.module('./sqlite/utils', () => ({
  run: mockDbRun,
  get: mockDbGet,
  all: mockDbAll,
}))

mock.module('electron-log', () => ({
  default: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}))

const mockGetCursorContext = mock(() => Promise.resolve(''))
mock.module('../media/selected-text-reader', () => ({
  getCursorContext: mockGetCursorContext,
}))

const mockCanGetContextFromCurrentApp = mock(() => Promise.resolve(true))
mock.module('../utils/applicationDetection', () => ({
  canGetContextFromCurrentApp: mockCanGetContextFromCurrentApp,
}))

const mockGrammarRulesService = {
  setCaseFirstWord: mock((_context: string, transcript: string) => transcript),
  addLeadingSpaceIfNeeded: mock(
    (_context: string, transcript: string) => transcript,
  ),
}
mock.module('./grammar/GrammarRulesService', () => ({
  grammarRulesService: mockGrammarRulesService,
}))

const mockAudioStreamManager = {
  isCurrentlyStreaming: mock(() => false),
  startStreaming: mock(),
  stopStreaming: mock(),
  addAudioChunk: mock(),
  hasMinimumDuration: mock(() => true),
  streamAudioChunks: mock(
    () =>
      async function* () {
        yield Buffer.from('test')
      },
  ),
  getInteractionAudioBuffer: mock(() => Buffer.from('audio-data')),
  getCurrentSampleRate: mock(() => 16000),
  clearInteractionAudio: mock(),
  setAudioConfig: mock(),
  getBufferedDurationMs: mock(() => 50),
}
mock.module('./audio/AudioStreamManager', () => ({
  AudioStreamManager: class MockAudioStreamManager {
    isCurrentlyStreaming = mockAudioStreamManager.isCurrentlyStreaming
    startStreaming = mockAudioStreamManager.startStreaming
    stopStreaming = mockAudioStreamManager.stopStreaming
    addAudioChunk = mockAudioStreamManager.addAudioChunk
    streamAudioChunks = mockAudioStreamManager.streamAudioChunks
    getInteractionAudioBuffer = mockAudioStreamManager.getInteractionAudioBuffer
    getCurrentSampleRate = mockAudioStreamManager.getCurrentSampleRate
    clearInteractionAudio = mockAudioStreamManager.clearInteractionAudio
    setAudioConfig = mockAudioStreamManager.setAudioConfig
    hasMinimumDuration = mockAudioStreamManager.hasMinimumDuration
    getBufferedDurationMs = mockAudioStreamManager.getBufferedDurationMs
  },
}))

const mockInteractionManager = {
  startInteraction: mock(() => 'test-interaction-123'),
  adoptInteractionId: mock(),
  clearCurrentInteraction: mock(),
  createInteraction: mock(() => Promise.resolve()),
  getCurrentInteractionId: mock(() => 'test-interaction-123'),
  getInteractionStartTime: mock(() => Date.now()),
}
mock.module('./interactions/InteractionManager', () => ({
  InteractionManager: class MockInteractionManager {
    startInteraction = mockInteractionManager.startInteraction
    adoptInteractionId = mockInteractionManager.adoptInteractionId
    clearCurrentInteraction = mockInteractionManager.clearCurrentInteraction
    createInteraction = mockInteractionManager.createInteraction
    getCurrentInteractionId = mockInteractionManager.getCurrentInteractionId
    getInteractionStartTime = mockInteractionManager.getInteractionStartTime
  },
}))

const mockWindowMessenger = {
  setMainWindow: mock(),
  sendTranscriptionResult: mock(),
  sendTranscriptionError: mock(),
}
mock.module('./messaging/WindowMessenger', () => ({
  WindowMessenger: class MockWindowMessenger {
    setMainWindow = mockWindowMessenger.setMainWindow
    sendTranscriptionResult = mockWindowMessenger.sendTranscriptionResult
    sendTranscriptionError = mockWindowMessenger.sendTranscriptionError
  },
}))

const mockTextInserter = {
  insertText: mock(() => Promise.resolve(true)),
}
mock.module('./text/TextInserter', () => ({
  TextInserter: class MockTextInserter {
    insertText = mockTextInserter.insertText
  },
}))

const mockTraceLogger = {
  logStep: mock(),
  logError: mock(),
  endInteraction: mock(),
}
mock.module('./traceLogger', () => ({
  traceLogger: mockTraceLogger,
}))

beforeEach(() => {
  console.log = mock()
  console.error = mock()
})

import { ItoMode } from '@/app/generated/ito_pb'

describe('TranscriptionService', () => {
  beforeEach(() => {
    // Reset all mocks
    Object.values(mockAudioStreamManager).forEach(mock => mock.mockClear())
    Object.values(mockInteractionManager).forEach(mock => mock.mockClear())
    Object.values(mockWindowMessenger).forEach(mock => mock.mockClear())
    Object.values(mockTextInserter).forEach(mock => mock.mockClear())
    Object.values(mockGrammarRulesService).forEach(mock => mock.mockClear())
    Object.values(mockTraceLogger).forEach(mock => mock.mockClear())

    mockGrpcClient.transcribeStream.mockClear()
    mockGrpcClient.transcribeStream.mockResolvedValue({ transcript: 'default' })

    mockGetCursorContext.mockClear()
    mockGetCursorContext.mockResolvedValue('')

    mockCanGetContextFromCurrentApp.mockClear()
    mockCanGetContextFromCurrentApp.mockResolvedValue(true)

    // Reset default behaviors
    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)
    mockAudioStreamManager.hasMinimumDuration.mockReturnValue(true)
    mockInteractionManager.startInteraction.mockReturnValue(
      'test-interaction-123',
    )
    mockTextInserter.insertText.mockResolvedValue(true)

    // Clear global interaction ID
    ;(globalThis as any).currentInteractionId = null
  })

  test('should handle successful transcription flow', async () => {
    const mockTranscript = 'Hello world'
    mockGrpcClient.transcribeStream.mockResolvedValueOnce({
      transcript: mockTranscript,
    })

    // Create fresh instance
    const { TranscriptionService } = await import('./transcriptionService')
    const transcriptionService = new (TranscriptionService as any)()

    // Start transcription
    await transcriptionService.startTranscription(ItoMode.TRANSCRIBE)

    // Verify managers are coordinated
    expect(mockAudioStreamManager.startStreaming).toHaveBeenCalled()
    expect(mockInteractionManager.startInteraction).toHaveBeenCalled()

    // Set up for gRPC call
    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    // Forward audio chunk to trigger gRPC call
    transcriptionService.forwardAudioChunk(Buffer.from('audio'))

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 20))

    // Verify full flow
    expect(mockGrpcClient.transcribeStream).toHaveBeenCalled()
    expect(mockGetCursorContext).toHaveBeenCalled()
    expect(mockGrammarRulesService.setCaseFirstWord).toHaveBeenCalledWith(
      '',
      mockTranscript,
    )
    expect(mockGrammarRulesService.addLeadingSpaceIfNeeded).toHaveBeenCalled()
    expect(mockTextInserter.insertText).toHaveBeenCalled()
    expect(mockInteractionManager.createInteraction).toHaveBeenCalledWith(
      mockTranscript,
      Buffer.from('audio-data'),
      16000,
      undefined,
    )
    expect(mockWindowMessenger.sendTranscriptionResult).toHaveBeenCalledWith({
      transcript: mockTranscript,
    })
  })

  test('should handle transcription errors', async () => {
    const errorMessage = 'Network timeout'
    mockGrpcClient.transcribeStream.mockRejectedValueOnce(
      new Error(errorMessage),
    )

    const { TranscriptionService } = await import('./transcriptionService')
    const transcriptionService = new (TranscriptionService as any)()

    await transcriptionService.startTranscription(ItoMode.TRANSCRIBE)

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)
    transcriptionService.forwardAudioChunk(Buffer.from('audio'))

    await new Promise(resolve => setTimeout(resolve, 20))

    expect(mockWindowMessenger.sendTranscriptionError).toHaveBeenCalledWith(
      expect.objectContaining({ message: errorMessage }),
    )
    expect(mockInteractionManager.clearCurrentInteraction).toHaveBeenCalled()
    expect(mockAudioStreamManager.clearInteractionAudio).toHaveBeenCalled()
  })

  test('should handle short audio error', async () => {
    const { TranscriptionService } = await import('./transcriptionService')
    const transcriptionService = new (TranscriptionService as any)()

    await transcriptionService.startTranscription(ItoMode.TRANSCRIBE)

    // Set up insufficient audio
    mockAudioStreamManager.hasMinimumDuration.mockReturnValue(false)
    mockAudioStreamManager.getBufferedDurationMs.mockReturnValue(50)

    transcriptionService.forwardAudioChunk(Buffer.from('short'))
    transcriptionService.stopStreaming()

    await new Promise(resolve => setTimeout(resolve, 10))

    // Should NOT call gRPC due to insufficient audio
    expect(mockGrpcClient.transcribeStream).not.toHaveBeenCalled()
    expect(mockInteractionManager.clearCurrentInteraction).toHaveBeenCalled()
    expect(mockTraceLogger.logStep).toHaveBeenCalledWith(
      'test-interaction-123',
      'TRANSCRIPTION_TOO_SHORT',
      expect.any(Object),
    )
  })

  test('should prevent multiple simultaneous streams', async () => {
    const { TranscriptionService } = await import('./transcriptionService')
    const transcriptionService = new (TranscriptionService as any)()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    await transcriptionService.startTranscription(ItoMode.TRANSCRIBE)

    // Should not start new interaction when already streaming
    expect(mockInteractionManager.startInteraction).not.toHaveBeenCalled()
  })

  test('should delegate operations correctly', async () => {
    const { TranscriptionService } = await import('./transcriptionService')
    const transcriptionService = new (TranscriptionService as any)()

    // Test audio chunk forwarding
    const audioChunk = Buffer.from('audio-data')
    transcriptionService.forwardAudioChunk(audioChunk)
    expect(mockAudioStreamManager.addAudioChunk).toHaveBeenCalledWith(
      audioChunk,
    )

    // Test audio config
    const config = { sampleRate: 44100, channels: 2 }
    transcriptionService.setAudioConfig(config)
    expect(mockAudioStreamManager.setAudioConfig).toHaveBeenCalledWith(config)

    // Test window management
    const mockWindow = { isDestroyed: () => false } as any
    transcriptionService.setMainWindow(mockWindow)
    expect(mockWindowMessenger.setMainWindow).toHaveBeenCalledWith(mockWindow)

    // Test stop operations
    transcriptionService.stopStreaming()
    expect(mockAudioStreamManager.stopStreaming).toHaveBeenCalled()

    transcriptionService.stopTranscription()
    expect(mockAudioStreamManager.stopStreaming).toHaveBeenCalled()
    // clearInteractionAudio is no longer called in stopTranscription
  })
})
