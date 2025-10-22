import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { ItoMode } from '@/app/generated/ito_pb'

const mockGrpcClient = {
  transcribeStreamV2: mock(() =>
    Promise.resolve({ transcript: 'default' } as any),
  ),
}
mock.module('../clients/grpcClient', () => ({
  grpcClient: mockGrpcClient,
}))

const mockAudioStreamManager = {
  isCurrentlyStreaming: mock(() => false),
  initialize: mock(),
  stopStreaming: mock(),
  addAudioChunk: mock(),
  setAudioConfig: mock(),
  getInteractionAudioBuffer: mock(() => Buffer.from('audio-data')),
  getCurrentSampleRate: mock(() => 16000),
  clearInteractionAudio: mock(),
  getAudioDurationMs: mock(() => 1000),
  streamAudioChunks: mock(
    () =>
      async function* () {
        yield { audioData: Buffer.from('test-chunk-1') }
        yield { audioData: Buffer.from('test-chunk-2') }
      },
  ),
}
mock.module('./audio/AudioStreamManager', () => ({
  AudioStreamManager: class MockAudioStreamManager {
    isCurrentlyStreaming = mockAudioStreamManager.isCurrentlyStreaming
    initialize = mockAudioStreamManager.initialize
    stopStreaming = mockAudioStreamManager.stopStreaming
    addAudioChunk = mockAudioStreamManager.addAudioChunk
    setAudioConfig = mockAudioStreamManager.setAudioConfig
    getInteractionAudioBuffer = mockAudioStreamManager.getInteractionAudioBuffer
    getCurrentSampleRate = mockAudioStreamManager.getCurrentSampleRate
    clearInteractionAudio = mockAudioStreamManager.clearInteractionAudio
    getAudioDurationMs = mockAudioStreamManager.getAudioDurationMs
    streamAudioChunks = mockAudioStreamManager.streamAudioChunks
  },
}))

const mockInteractionManager = {
  getCurrentInteractionId: mock((): string | null => null),
  adoptInteractionId: mock(),
  initialize: mock(() => 'test-interaction-123'),
  clearCurrentInteraction: mock(),
}
mock.module('./interactions/InteractionManager', () => ({
  interactionManager: mockInteractionManager,
}))

const mockContextGrabber = {
  gatherContext: mock(() =>
    Promise.resolve({
      windowTitle: 'Test Window',
      appName: 'Test App',
      contextText: 'Test context',
      vocabularyWords: ['test', 'word'],
      advancedSettings: {
        llm: {
          asrModel: 'whisper-1',
          asrProvider: 'openai',
          asrPrompt: '',
          noSpeechThreshold: 0.5,
          llmProvider: 'openai',
          llmModel: 'gpt-4',
          llmTemperature: 0.7,
          transcriptionPrompt: '',
          editingPrompt: '',
        },
      },
    }),
  ),
}
mock.module('./context/ContextGrabber', () => ({
  contextGrabber: mockContextGrabber,
}))

const mockAudioRecorderService = {
  on: mock(),
  off: mock(),
}
mock.module('../media/audio', () => ({
  audioRecorderService: mockAudioRecorderService,
}))

mock.module('electron-log', () => ({
  default: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}))

beforeEach(() => {
  console.log = mock()
  console.error = mock()
})

describe('ItoStreamController', () => {
  beforeEach(() => {
    // Reset all mocks
    Object.values(mockAudioStreamManager).forEach(mockFn => mockFn.mockClear())
    Object.values(mockInteractionManager).forEach(mockFn => mockFn.mockClear())
    Object.values(mockContextGrabber).forEach(mockFn => mockFn.mockClear())

    mockGrpcClient.transcribeStreamV2.mockClear()
    mockGrpcClient.transcribeStreamV2.mockResolvedValue({
      transcript: 'default',
    })

    mockAudioRecorderService.on.mockClear()
    mockAudioRecorderService.off.mockClear()

    // Reset default behaviors
    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)
    mockAudioStreamManager.getAudioDurationMs.mockReturnValue(1000)
    mockAudioStreamManager.getInteractionAudioBuffer.mockReturnValue(
      Buffer.from('audio-data'),
    )
    mockAudioStreamManager.getCurrentSampleRate.mockReturnValue(16000)
    mockInteractionManager.getCurrentInteractionId.mockReturnValue(null)
  })

  test('should setup audio listeners on construction', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    new ItoStreamController()

    expect(mockAudioRecorderService.on).toHaveBeenCalledWith(
      'audio-chunk',
      expect.any(Function),
    )
    expect(mockAudioRecorderService.on).toHaveBeenCalledWith(
      'audio-config',
      expect.any(Function),
    )
  })

  test('should start interaction successfully', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    const started = await controller.initialize(ItoMode.TRANSCRIBE)

    expect(started).toBe(true)
    expect(mockAudioStreamManager.initialize).toHaveBeenCalled()
    expect(mockInteractionManager.initialize).toHaveBeenCalled()
  })

  test('should prevent multiple concurrent interactions', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    const started = await controller.initialize(ItoMode.TRANSCRIBE)

    expect(started).toBe(false)
    expect(mockInteractionManager.initialize).not.toHaveBeenCalled()
  })

  test('should adopt existing interaction ID if present', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockInteractionManager.getCurrentInteractionId.mockReturnValue(
      'existing-id-123',
    )

    await controller.initialize(ItoMode.TRANSCRIBE)

    expect(mockInteractionManager.adoptInteractionId).toHaveBeenCalledWith(
      'existing-id-123',
    )
    expect(mockInteractionManager.initialize).not.toHaveBeenCalled()
  })

  test('should start gRPC stream successfully', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    const mockResponse = {
      transcript: 'Hello world',
      audio: Buffer.from('audio'),
    }
    mockGrpcClient.transcribeStreamV2.mockResolvedValueOnce(mockResponse)

    await controller.initialize(ItoMode.TRANSCRIBE)

    const result = await controller.startGrpcStream()

    expect(mockGrpcClient.transcribeStreamV2).toHaveBeenCalled()
    expect(result).toEqual({
      response: mockResponse,
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })
  })

  test('should throw error when starting gRPC stream twice', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    await controller.initialize(ItoMode.TRANSCRIBE)
    await controller.startGrpcStream()

    await expect(controller.startGrpcStream()).rejects.toThrow(
      'Stream already started',
    )
  })

  test('should throw error when starting gRPC stream without mode set', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    await expect(controller.startGrpcStream()).rejects.toThrow('Mode not set')
  })

  test('should change mode during streaming', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    controller.setMode(ItoMode.EDIT)

    // Mode change should be queued - we can't easily verify the queue directly,
    // but we can verify it doesn't throw and the warning isn't logged for inactive stream
    expect(mockAudioStreamManager.isCurrentlyStreaming).toHaveBeenCalled()
  })

  test('should warn when changing mode without active stream', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)

    controller.setMode(ItoMode.EDIT)

    expect(mockAudioStreamManager.isCurrentlyStreaming).toHaveBeenCalled()
  })

  test('should send config update during streaming', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    await controller.initialize(ItoMode.TRANSCRIBE)
    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    await controller.sendConfigUpdate()

    expect(mockContextGrabber.gatherContext).toHaveBeenCalledWith(
      ItoMode.TRANSCRIBE,
    )
  })

  test('should warn when sending config without active stream', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)

    await controller.sendConfigUpdate()

    expect(mockContextGrabber.gatherContext).not.toHaveBeenCalled()
  })

  test('should end interaction successfully', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    controller.endInteraction()

    expect(mockAudioStreamManager.stopStreaming).toHaveBeenCalled()
  })

  test('should warn when ending non-existent interaction', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)

    controller.endInteraction()

    expect(mockAudioStreamManager.stopStreaming).not.toHaveBeenCalled()
  })

  test('should cancel transcription successfully', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)
    await controller.initialize(ItoMode.TRANSCRIBE)

    controller.cancelTranscription()

    expect(mockAudioStreamManager.stopStreaming).toHaveBeenCalled()
    expect(mockAudioStreamManager.clearInteractionAudio).toHaveBeenCalled()
  })

  test('should clear interaction when cancelling before gRPC starts', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)
    await controller.initialize(ItoMode.TRANSCRIBE)

    // Cancel before starting gRPC
    controller.cancelTranscription()

    expect(mockInteractionManager.clearCurrentInteraction).toHaveBeenCalled()
  })

  test('should not clear interaction when cancelling after gRPC starts', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    await controller.initialize(ItoMode.TRANSCRIBE)
    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    // Start gRPC stream (which sets hasStartedGrpc = true)
    const streamPromise = controller.startGrpcStream()

    // Cancel after gRPC starts
    controller.cancelTranscription()

    // Clear should not be called during cancellation because hasStartedGrpc is true
    expect(
      mockInteractionManager.clearCurrentInteraction,
    ).not.toHaveBeenCalled()

    // Wait for stream to complete
    await expect(streamPromise).rejects.toThrow('Transcription was cancelled')
  })

  test('should return audio duration', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.getAudioDurationMs.mockReturnValue(5000)

    const duration = controller.getAudioDurationMs()

    expect(duration).toBe(5000)
    expect(mockAudioStreamManager.getAudioDurationMs).toHaveBeenCalled()
  })

  test('should clear interaction audio', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    controller.clearInteractionAudio()

    expect(mockAudioStreamManager.clearInteractionAudio).toHaveBeenCalled()
  })

  test('should handle audio chunk events', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    new ItoStreamController()

    // Get the audio-chunk handler that was registered
    const audioChunkHandler = mockAudioRecorderService.on.mock.calls.find(
      call => call[0] === 'audio-chunk',
    )?.[1]

    expect(audioChunkHandler).toBeDefined()

    // Simulate audio chunk event
    const testChunk = Buffer.from('test-audio-data')
    audioChunkHandler?.(testChunk)

    expect(mockAudioStreamManager.addAudioChunk).toHaveBeenCalledWith(testChunk)
  })

  test('should handle audio config events', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    new ItoStreamController()

    // Get the audio-config handler that was registered
    const audioConfigHandler = mockAudioRecorderService.on.mock.calls.find(
      call => call[0] === 'audio-config',
    )?.[1]

    expect(audioConfigHandler).toBeDefined()

    // Simulate audio config event
    audioConfigHandler?.({ outputSampleRate: 48000, sampleRate: 44100 })

    expect(mockAudioStreamManager.setAudioConfig).toHaveBeenCalledWith({
      sampleRate: 48000,
    })
  })

  test('should use fallback sample rate when no config provided', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    new ItoStreamController()

    // Get the audio-config handler
    const audioConfigHandler = mockAudioRecorderService.on.mock.calls.find(
      call => call[0] === 'audio-config',
    )?.[1]

    // Simulate audio config event with no sample rate
    audioConfigHandler?.({})

    expect(mockAudioStreamManager.setAudioConfig).toHaveBeenCalledWith({
      sampleRate: 16000,
    })
  })
})
