import { describe, test, expect, beforeEach, mock } from 'bun:test'

const mockGrpcClient = {
  transcribeStream: mock(() =>
    Promise.resolve({ transcript: 'default' } as any),
  ),
}
mock.module('../clients/grpcClient', () => ({
  grpcClient: mockGrpcClient,
}))

// Mock electron store
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

// Mock database utilities (same pattern as repo.test.ts to avoid conflicts)
const mockDbRun = mock(() => Promise.resolve())
const mockDbGet = mock(() => Promise.resolve(undefined))
const mockDbAll = mock(() => Promise.resolve([]))

mock.module('./sqlite/utils', () => ({
  run: mockDbRun,
  get: mockDbGet,
  all: mockDbAll,
}))

// Mock electron-log
mock.module('electron-log', () => ({
  default: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}))

// Mock cursor context reader
const mockGetCursorContext = mock(() => Promise.resolve(''))
mock.module('../media/selected-text-reader', () => ({
  getCursorContext: mockGetCursorContext,
}))

// Mock application detection
const mockCanGetContextFromCurrentApp = mock(() => Promise.resolve(true))
mock.module('../utils/applicationDetection', () => ({
  canGetContextFromCurrentApp: mockCanGetContextFromCurrentApp,
}))

// Mock grammar rules service
const mockGrammarRulesService = {
  setCaseFirstWord: mock((_context: string, transcript: string) => transcript),
  addLeadingSpaceIfNeeded: mock(
    (_context: string, transcript: string) => transcript,
  ),
}
mock.module('./grammar/GrammarRulesService', () => ({
  grammarRulesService: mockGrammarRulesService,
}))

// Mock manager classes
const mockAudioStreamManager = {
  isCurrentlyStreaming: mock(() => false),
  startStreaming: mock(),
  stopStreaming: mock(),
  addAudioChunk: mock(),
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
  },
}))

const mockInteractionManager = {
  startInteraction: mock(() => 'test-interaction-123'),
  clearCurrentInteraction: mock(),
  createInteraction: mock(() => Promise.resolve()),
  getCurrentInteractionId: mock(() => 'test-interaction-123'),
  getInteractionStartTime: mock(() => Date.now()),
}
mock.module('./interactions/InteractionManager', () => ({
  InteractionManager: class MockInteractionManager {
    startInteraction = mockInteractionManager.startInteraction
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

// Mock trace logger
const mockTraceLogger = {
  logStep: mock(),
  logError: mock(),
  endInteraction: mock(),
}
mock.module('./traceLogger', () => ({
  traceLogger: mockTraceLogger,
}))

// Mock console to avoid noise
beforeEach(() => {
  console.log = mock()
  console.error = mock()
})

import { ItoMode } from '@/app/generated/ito_pb'

describe('TranscriptionService Orchestration Tests', () => {
  beforeEach(() => {
    // Re-apply manager class mocks (needed because global setup clears them)
    mock.module('./audio/AudioStreamManager', () => ({
      AudioStreamManager: class MockAudioStreamManager {
        isCurrentlyStreaming = mockAudioStreamManager.isCurrentlyStreaming
        startStreaming = mockAudioStreamManager.startStreaming
        stopStreaming = mockAudioStreamManager.stopStreaming
        addAudioChunk = mockAudioStreamManager.addAudioChunk
        streamAudioChunks = mockAudioStreamManager.streamAudioChunks
        getInteractionAudioBuffer =
          mockAudioStreamManager.getInteractionAudioBuffer
        getCurrentSampleRate = mockAudioStreamManager.getCurrentSampleRate
        clearInteractionAudio = mockAudioStreamManager.clearInteractionAudio
        setAudioConfig = mockAudioStreamManager.setAudioConfig
      },
    }))

    mock.module('./interactions/InteractionManager', () => ({
      InteractionManager: class MockInteractionManager {
        startInteraction = mockInteractionManager.startInteraction
        clearCurrentInteraction = mockInteractionManager.clearCurrentInteraction
        createInteraction = mockInteractionManager.createInteraction
        getCurrentInteractionId = mockInteractionManager.getCurrentInteractionId
        getInteractionStartTime = mockInteractionManager.getInteractionStartTime
      },
    }))

    mock.module('./messaging/WindowMessenger', () => ({
      WindowMessenger: class MockWindowMessenger {
        setMainWindow = mockWindowMessenger.setMainWindow
        sendTranscriptionResult = mockWindowMessenger.sendTranscriptionResult
        sendTranscriptionError = mockWindowMessenger.sendTranscriptionError
      },
    }))

    mock.module('./text/TextInserter', () => ({
      TextInserter: class MockTextInserter {
        insertText = mockTextInserter.insertText
      },
    }))

    mock.module('./grammar/GrammarRulesService', () => ({
      grammarRulesService: mockGrammarRulesService,
    }))

    mock.module('./traceLogger', () => ({
      traceLogger: mockTraceLogger,
    }))

    mock.module('../media/selected-text-reader', () => ({
      getCursorContext: mockGetCursorContext,
    }))

    mock.module('../clients/grpcClient', () => ({
      grpcClient: mockGrpcClient,
    }))

    // Reset all manager mocks
    Object.values(mockAudioStreamManager).forEach(mock => mock.mockClear())
    Object.values(mockInteractionManager).forEach(mock => mock.mockClear())
    Object.values(mockWindowMessenger).forEach(mock => mock.mockClear())
    Object.values(mockTextInserter).forEach(mock => mock.mockClear())
    Object.values(mockGrammarRulesService).forEach(mock => mock.mockClear())
    Object.values(mockTraceLogger).forEach(mock => mock.mockClear())

    // Reset gRPC client
    mockGrpcClient.transcribeStream.mockClear()
    mockGrpcClient.transcribeStream.mockResolvedValue({ transcript: 'default' })

    // Reset cursor context
    mockGetCursorContext.mockClear()
    mockGetCursorContext.mockResolvedValue('')

    // Reset default manager behaviors
    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)
    mockInteractionManager.startInteraction.mockReturnValue(
      'test-interaction-123',
    )
    mockTextInserter.insertText.mockResolvedValue(true)

    // Clear global interaction ID
    ;(globalThis as any).currentInteractionId = null
  })

  describe('Manager Orchestration', () => {
    test('should coordinate all managers for successful transcription', async () => {
      const { transcriptionService } = await import('./transcriptionService')

      const mockTranscript = 'Hello world'
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: mockTranscript,
      })

      // Start transcription
      await transcriptionService.startTranscription(ItoMode.TRANSCRIBE)

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))

      // Verify manager coordination
      expect(mockAudioStreamManager.startStreaming).toHaveBeenCalled()
      expect(mockInteractionManager.startInteraction).toHaveBeenCalled()
      expect(mockGrpcClient.transcribeStream).toHaveBeenCalledWith(
        expect.any(Function), // audio stream generator
        ItoMode.TRANSCRIBE,
      )

      // Wait for transcription response handling
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockGetCursorContext).toHaveBeenCalled()
      expect(mockGrammarRulesService.setCaseFirstWord).toHaveBeenCalledWith(
        '',
        mockTranscript,
      )
      expect(mockGrammarRulesService.addLeadingSpaceIfNeeded).toHaveBeenCalled()
      expect(mockTextInserter.insertText).toHaveBeenCalled()
      expect(mockInteractionManager.createInteraction).toHaveBeenCalled()
      expect(mockWindowMessenger.sendTranscriptionResult).toHaveBeenCalledWith({
        transcript: mockTranscript,
      })
    })

    test('should coordinate error handling across managers', async () => {
      const { transcriptionService } = await import('./transcriptionService')

      const errorMessage = 'Network timeout'
      mockGrpcClient.transcribeStream.mockRejectedValueOnce(
        new Error(errorMessage),
      )

      await transcriptionService.startTranscription(ItoMode.TRANSCRIBE)

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 10))

      // Verify error coordination
      expect(mockWindowMessenger.sendTranscriptionError).toHaveBeenCalledWith(
        expect.objectContaining({ message: errorMessage }),
      )
      expect(mockInteractionManager.clearCurrentInteraction).toHaveBeenCalled()
      expect(mockAudioStreamManager.clearInteractionAudio).toHaveBeenCalled()
    })

    test('should handle short audio error properly', async () => {
      const { transcriptionService } = await import('./transcriptionService')

      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: '',
        error: {
          code: 'CLIENT_AUDIO_TOO_SHORT',
          message: 'Audio too short',
        },
      })

      await transcriptionService.startTranscription(ItoMode.TRANSCRIBE)

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should create interaction even for too-short audio (to save failed attempts)
      expect(mockInteractionManager.createInteraction).toHaveBeenCalledWith(
        '',
        expect.any(Buffer),
        16000,
        'Audio too short',
      )
      expect(mockTextInserter.insertText).not.toHaveBeenCalled()
      expect(mockTraceLogger.logStep).toHaveBeenCalledWith(
        'test-interaction-123',
        'TRANSCRIPTION_TOO_SHORT',
        expect.any(Object),
      )
    })
  })

  describe('Streaming State Management', () => {
    test('should prevent multiple simultaneous streams', async () => {
      // Import after mocks are established
      const { transcriptionService } = await import('./transcriptionService')

      mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

      await transcriptionService.startTranscription(ItoMode.TRANSCRIBE)

      // Should not start new interaction when already streaming
      expect(mockInteractionManager.startInteraction).not.toHaveBeenCalled()
      expect(mockGrpcClient.transcribeStream).not.toHaveBeenCalled()
    })

    test('should coordinate stop operations across managers', async () => {
      // Import after mocks are established
      const { transcriptionService } = await import('./transcriptionService')

      transcriptionService.stopStreaming()

      expect(mockAudioStreamManager.stopStreaming).toHaveBeenCalled()
      // Note: clearCurrentInteraction is no longer called in stopStreaming to preserve ID for database save
      expect(
        mockInteractionManager.clearCurrentInteraction,
      ).not.toHaveBeenCalled()
    })

    test('should forward audio chunks to audio manager', async () => {
      const { transcriptionService } = await import('./transcriptionService')

      const audioChunk = Buffer.from('audio-data')
      transcriptionService.forwardAudioChunk(audioChunk)

      expect(mockAudioStreamManager.addAudioChunk).toHaveBeenCalledWith(
        audioChunk,
      )
    })
  })

  describe('Audio Configuration', () => {
    test('should delegate audio configuration to audio manager', async () => {
      const { transcriptionService } = await import('./transcriptionService')

      const config = { sampleRate: 44100, channels: 2 }
      transcriptionService.setAudioConfig(config)

      expect(mockAudioStreamManager.setAudioConfig).toHaveBeenCalledWith(config)
    })

    test('should delegate window management to window messenger', async () => {
      const { transcriptionService } = await import('./transcriptionService')

      const mockWindow = { isDestroyed: () => false } as any
      transcriptionService.setMainWindow(mockWindow)

      expect(mockWindowMessenger.setMainWindow).toHaveBeenCalledWith(mockWindow)
    })
  })

  describe('Grammar Processing Integration', () => {
    test('should apply grammar rules with cursor context', async () => {
      const { transcriptionService } = await import('./transcriptionService')
      const mockTranscript = 'hello world'
      const mockContext = 'Some text before. '
      mockGetCursorContext.mockResolvedValueOnce(mockContext)
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: mockTranscript,
      })

      await transcriptionService.startTranscription(ItoMode.TRANSCRIBE)

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockGetCursorContext).toHaveBeenCalledWith(4) // contextLength
      expect(mockGrammarRulesService.setCaseFirstWord).toHaveBeenCalledWith(
        mockContext,
        mockTranscript,
      )
      expect(
        mockGrammarRulesService.addLeadingSpaceIfNeeded,
      ).toHaveBeenCalledWith(
        mockContext,
        mockTranscript, // or the result of capitalization
      )
    })
  })

  describe('Interaction Data Flow', () => {
    test('should pass correct data between managers', async () => {
      const { transcriptionService } = await import('./transcriptionService')
      const mockTranscript = 'test transcript'
      const mockAudioBuffer = Buffer.from('audio-data')
      const mockSampleRate = 16000

      mockAudioStreamManager.getInteractionAudioBuffer.mockReturnValue(
        mockAudioBuffer,
      )
      mockAudioStreamManager.getCurrentSampleRate.mockReturnValue(
        mockSampleRate,
      )
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: mockTranscript,
      })

      await transcriptionService.startTranscription(ItoMode.TRANSCRIBE)

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockInteractionManager.createInteraction).toHaveBeenCalledWith(
        mockTranscript,
        mockAudioBuffer,
        mockSampleRate,
        undefined, // no error
      )
    })
  })

  describe('Trace Logging Integration', () => {
    test('should log interaction lifecycle events', async () => {
      const { transcriptionService } = await import('./transcriptionService')
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: 'test',
      })

      await transcriptionService.startTranscription(ItoMode.TRANSCRIBE)

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockTraceLogger.logStep).toHaveBeenCalledWith(
        'test-interaction-123',
        'TRANSCRIPTION_START',
        expect.any(Object),
      )
      expect(mockTraceLogger.logStep).toHaveBeenCalledWith(
        'test-interaction-123',
        'TRANSCRIPTION_SUCCESS',
        expect.any(Object),
      )
      expect(mockTraceLogger.endInteraction).toHaveBeenCalledWith(
        'test-interaction-123',
        'TRANSCRIPTION_COMPLETED',
        expect.any(Object),
      )
    })
  })

  describe('Alternative Methods', () => {
    test('stopTranscription should coordinate cleanup', async () => {
      const { transcriptionService } = await import('./transcriptionService')
      transcriptionService.stopTranscription()

      expect(mockAudioStreamManager.stopStreaming).toHaveBeenCalled()
      // Note: clearCurrentInteraction is no longer called in stopTranscription to preserve ID for database save
      expect(
        mockInteractionManager.clearCurrentInteraction,
      ).not.toHaveBeenCalled()
      expect(mockAudioStreamManager.clearInteractionAudio).toHaveBeenCalled()
    })

    test('handleAudioChunk should delegate to forwardAudioChunk', async () => {
      const { transcriptionService } = await import('./transcriptionService')
      const chunk = Buffer.from('audio')
      transcriptionService.handleAudioChunk(chunk)

      expect(mockAudioStreamManager.addAudioChunk).toHaveBeenCalledWith(chunk)
    })
  })
})
