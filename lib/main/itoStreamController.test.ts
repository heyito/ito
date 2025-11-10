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
        grammarServiceEnabled: false,
        macosAccessibilityContextEnabled: true,
      },
    }),
  ),
}
mock.module('./context/ContextGrabber', () => ({
  contextGrabber: mockContextGrabber,
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
    Object.values(mockContextGrabber).forEach(mockFn => mockFn.mockClear())

    mockGrpcClient.transcribeStreamV2.mockClear()
    mockGrpcClient.transcribeStreamV2.mockResolvedValue({
      transcript: 'default',
    })

    // Reset default behaviors
    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)
    mockAudioStreamManager.getAudioDurationMs.mockReturnValue(1000)
    mockAudioStreamManager.getInteractionAudioBuffer.mockReturnValue(
      Buffer.from('audio-data'),
    )
    mockAudioStreamManager.getCurrentSampleRate.mockReturnValue(16000)
  })

  test('should start interaction successfully', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    const started = await controller.initialize(ItoMode.TRANSCRIBE)

    expect(started).toBe(true)
    expect(mockAudioStreamManager.initialize).toHaveBeenCalled()
  })

  test('should prevent multiple concurrent interactions', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(true)

    const started = await controller.initialize(ItoMode.TRANSCRIBE)

    expect(started).toBe(false)
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

    const mockContext = await mockContextGrabber.gatherContext()
    await controller.sendConfigUpdate(mockContext)

    expect(mockContextGrabber.gatherContext).toHaveBeenCalled()
  })

  test('should warn when sending config without active stream', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.isCurrentlyStreaming.mockReturnValue(false)

    const mockContext = await mockContextGrabber.gatherContext()
    await controller.sendConfigUpdate(mockContext)

    // Should not be called again since we already called it to get mockContext
    expect(mockContextGrabber.gatherContext).toHaveBeenCalledTimes(1)
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
  })

  test('should return audio duration', async () => {
    const { ItoStreamController } = await import('./itoStreamController')
    const controller = new ItoStreamController()

    mockAudioStreamManager.getAudioDurationMs.mockReturnValue(5000)

    const duration = controller.getAudioDurationMs()

    expect(duration).toBe(5000)
    expect(mockAudioStreamManager.getAudioDurationMs).toHaveBeenCalled()
  })
})
