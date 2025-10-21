import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { ItoMode } from '@/app/generated/ito_pb'

const mockVoiceInputService = {
  startAudioRecording: mock(() => Promise.resolve()),
  stopAudioRecording: mock(() => Promise.resolve()),
}
mock.module('./voiceInputService', () => ({
  voiceInputService: mockVoiceInputService,
}))

const mockRecordingStateNotifier = {
  notifyRecordingStarted: mock(),
  notifyRecordingStopped: mock(),
}
mock.module('./recordingStateNotifier', () => ({
  recordingStateNotifier: mockRecordingStateNotifier,
}))

const mockItoStreamController = {
  startInteraction: mock(() => Promise.resolve(true)),
  startGrpcStream: mock(() =>
    Promise.resolve({
      response: { transcript: 'test transcript' },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    }),
  ),
  setMode: mock(),
  sendConfigUpdate: mock(() => Promise.resolve()),
  getAudioDurationMs: mock(() => 1000),
  endInteraction: mock(),
  cancelTranscription: mock(),
  clearInteractionAudio: mock(),
}
mock.module('./itoStreamController', () => ({
  itoStreamController: mockItoStreamController,
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

const mockInteractionManager = {
  createInteraction: mock(() => Promise.resolve()),
  clearCurrentInteraction: mock(),
}
mock.module('./interactions/InteractionManager', () => ({
  interactionManager: mockInteractionManager,
}))

const mockContextGrabber = {
  getCursorContextForGrammar: mock(() => Promise.resolve('test context')),
}
mock.module('./context/ContextGrabber', () => ({
  contextGrabber: mockContextGrabber,
}))

const mockGrammarRulesService = {
  setCaseFirstWord: mock((text: string) => text),
  addLeadingSpaceIfNeeded: mock((text: string) => text),
}
mock.module('./grammar/GrammarRulesService', () => ({
  GrammarRulesService: class MockGrammarRulesService {
    setCaseFirstWord = mockGrammarRulesService.setCaseFirstWord
    addLeadingSpaceIfNeeded = mockGrammarRulesService.addLeadingSpaceIfNeeded
  },
}))

const mockGetAdvancedSettings = mock(() => ({
  grammarServiceEnabled: false,
}))
mock.module('./store', () => ({
  getAdvancedSettings: mockGetAdvancedSettings,
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

describe('ItoSession', () => {
  beforeEach(() => {
    // Reset all mocks
    Object.values(mockVoiceInputService).forEach(mockFn => mockFn.mockClear())
    Object.values(mockRecordingStateNotifier).forEach(mockFn =>
      mockFn.mockClear(),
    )
    Object.values(mockItoStreamController).forEach(mockFn => mockFn.mockClear())
    Object.values(mockWindowMessenger).forEach(mockFn => mockFn.mockClear())
    Object.values(mockTextInserter).forEach(mockFn => mockFn.mockClear())
    Object.values(mockInteractionManager).forEach(mockFn => mockFn.mockClear())
    Object.values(mockContextGrabber).forEach(mockFn => mockFn.mockClear())
    Object.values(mockGrammarRulesService).forEach(mockFn => mockFn.mockClear())

    mockGetAdvancedSettings.mockClear()

    // Reset default behaviors
    mockItoStreamController.startInteraction.mockResolvedValue(true)
    mockItoStreamController.startGrpcStream.mockResolvedValue({
      response: { transcript: 'test transcript' },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })
    mockItoStreamController.getAudioDurationMs.mockReturnValue(1000)
    mockTextInserter.insertText.mockResolvedValue(true)
    mockGetAdvancedSettings.mockReturnValue({
      grammarServiceEnabled: false,
    })
  })

  test('should start session successfully', async () => {
    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.startSession(ItoMode.TRANSCRIBE)

    expect(mockItoStreamController.startInteraction).toHaveBeenCalledWith(
      ItoMode.TRANSCRIBE,
    )
    expect(mockItoStreamController.startGrpcStream).toHaveBeenCalled()
    expect(mockItoStreamController.setMode).toHaveBeenCalledWith(
      ItoMode.TRANSCRIBE,
    )
    expect(mockVoiceInputService.startAudioRecording).toHaveBeenCalled()
    expect(
      mockRecordingStateNotifier.notifyRecordingStarted,
    ).toHaveBeenCalledWith(ItoMode.TRANSCRIBE)
  })

  test('should fetch and send context in background', async () => {
    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.startSession(ItoMode.TRANSCRIBE)

    // Wait for background context fetch
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(mockItoStreamController.sendConfigUpdate).toHaveBeenCalled()
  })

  test('should fetch cursor context when grammar is enabled', async () => {
    mockGetAdvancedSettings.mockReturnValue({
      grammarServiceEnabled: true,
    })

    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.startSession(ItoMode.TRANSCRIBE)

    // Wait for background context fetch
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(mockContextGrabber.getCursorContextForGrammar).toHaveBeenCalledWith(
      4,
    )
  })

  test('should not fetch cursor context when grammar is disabled', async () => {
    mockGetAdvancedSettings.mockReturnValue({
      grammarServiceEnabled: false,
    })

    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.startSession(ItoMode.TRANSCRIBE)

    // Wait for background context fetch
    await new Promise(resolve => setTimeout(resolve, 50))
  })

  test('should fail to start session when controller fails', async () => {
    mockItoStreamController.startInteraction.mockResolvedValueOnce(false)

    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.startSession(ItoMode.TRANSCRIBE)

    expect(mockVoiceInputService.startAudioRecording).not.toHaveBeenCalled()
  })

  test('should change mode during session', async () => {
    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    session.setMode(ItoMode.EDIT)

    expect(mockItoStreamController.setMode).toHaveBeenCalledWith(ItoMode.EDIT)
    expect(
      mockRecordingStateNotifier.notifyRecordingStarted,
    ).toHaveBeenCalledWith(ItoMode.EDIT)
  })

  test('should cancel session successfully', async () => {
    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.cancelSession()

    expect(mockItoStreamController.cancelTranscription).toHaveBeenCalled()
    expect(mockVoiceInputService.stopAudioRecording).toHaveBeenCalled()
    expect(mockRecordingStateNotifier.notifyRecordingStopped).toHaveBeenCalled()
  })

  test('should complete session with sufficient audio', async () => {
    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    mockItoStreamController.getAudioDurationMs.mockReturnValue(500)

    await session.startSession(ItoMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockVoiceInputService.stopAudioRecording).toHaveBeenCalled()
    expect(mockItoStreamController.endInteraction).toHaveBeenCalled()
    expect(mockRecordingStateNotifier.notifyRecordingStopped).toHaveBeenCalled()
  })

  test('should cancel session when audio too short', async () => {
    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    mockItoStreamController.getAudioDurationMs.mockReturnValue(50)

    await session.startSession(ItoMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockItoStreamController.cancelTranscription).toHaveBeenCalled()
    expect(mockItoStreamController.endInteraction).not.toHaveBeenCalled()
    expect(mockRecordingStateNotifier.notifyRecordingStopped).toHaveBeenCalled()
  })

  test('should handle successful transcription response', async () => {
    const mockTranscript = 'Hello world'
    mockItoStreamController.startGrpcStream.mockResolvedValueOnce({
      response: { transcript: mockTranscript },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.startSession(ItoMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockTextInserter.insertText).toHaveBeenCalledWith(mockTranscript)
    expect(mockInteractionManager.createInteraction).toHaveBeenCalledWith(
      mockTranscript,
      Buffer.from('audio-data'),
      16000,
      undefined,
    )
    expect(mockWindowMessenger.sendTranscriptionResult).toHaveBeenCalledWith({
      transcript: mockTranscript,
    })
    expect(mockItoStreamController.clearInteractionAudio).toHaveBeenCalled()
    expect(mockInteractionManager.clearCurrentInteraction).toHaveBeenCalled()
  })

  test('should apply grammar rules when enabled', async () => {
    mockGetAdvancedSettings.mockReturnValue({
      grammarServiceEnabled: true,
    })

    const mockTranscript = 'hello world'
    mockItoStreamController.startGrpcStream.mockResolvedValueOnce({
      response: { transcript: mockTranscript },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    mockGrammarRulesService.setCaseFirstWord.mockReturnValue('Hello world')
    mockGrammarRulesService.addLeadingSpaceIfNeeded.mockReturnValue(
      ' Hello world',
    )

    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.startSession(ItoMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockGrammarRulesService.setCaseFirstWord).toHaveBeenCalledWith(
      mockTranscript,
    )
    expect(
      mockGrammarRulesService.addLeadingSpaceIfNeeded,
    ).toHaveBeenCalledWith('Hello world')
    expect(mockTextInserter.insertText).toHaveBeenCalledWith(' Hello world')
  })

  test('should not apply grammar rules when disabled', async () => {
    mockGetAdvancedSettings.mockReturnValue({
      grammarServiceEnabled: false,
    })

    const mockTranscript = 'hello world'
    mockItoStreamController.startGrpcStream.mockResolvedValueOnce({
      response: { transcript: mockTranscript },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.startSession(ItoMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockGrammarRulesService.setCaseFirstWord).not.toHaveBeenCalled()
    expect(
      mockGrammarRulesService.addLeadingSpaceIfNeeded,
    ).not.toHaveBeenCalled()
    expect(mockTextInserter.insertText).toHaveBeenCalledWith(mockTranscript)
  })

  test('should handle transcription error from server', async () => {
    const errorMessage = 'ASR service unavailable'
    mockItoStreamController.startGrpcStream.mockResolvedValueOnce({
      response: {
        transcript: '',
        error: { message: errorMessage },
      } as any,
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.startSession(ItoMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockTextInserter.insertText).not.toHaveBeenCalled()
    expect(mockInteractionManager.createInteraction).toHaveBeenCalledWith(
      '',
      Buffer.from('audio-data'),
      16000,
      errorMessage,
    )
    expect(mockItoStreamController.clearInteractionAudio).toHaveBeenCalled()
    expect(mockInteractionManager.clearCurrentInteraction).toHaveBeenCalled()
  })

  test('should handle unexpected transcription error', async () => {
    const error = new Error('Network timeout')
    mockItoStreamController.startGrpcStream.mockRejectedValueOnce(error)

    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.startSession(ItoMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockWindowMessenger.sendTranscriptionError).toHaveBeenCalledWith(
      error,
    )
    expect(mockInteractionManager.clearCurrentInteraction).toHaveBeenCalled()
    expect(mockItoStreamController.clearInteractionAudio).toHaveBeenCalled()
  })

  test('should skip text insertion when no transcript', async () => {
    mockItoStreamController.startGrpcStream.mockResolvedValueOnce({
      response: { transcript: '' },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    await session.startSession(ItoMode.TRANSCRIBE)
    await session.completeSession()

    expect(mockTextInserter.insertText).not.toHaveBeenCalled()
    expect(mockWindowMessenger.sendTranscriptionResult).toHaveBeenCalledWith({
      transcript: '',
    })
  })

  test('should set main window', async () => {
    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    const mockWindow = { isDestroyed: () => false } as any
    session.setMainWindow(mockWindow)

    expect(mockWindowMessenger.setMainWindow).toHaveBeenCalledWith(mockWindow)
  })

  test('should handle context fetch error gracefully', async () => {
    mockItoStreamController.sendConfigUpdate.mockRejectedValueOnce(
      new Error('Context fetch failed'),
    )

    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    // Should not throw
    await session.startSession(ItoMode.TRANSCRIBE)

    // Wait for background context fetch to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    // Session should still continue normally
    expect(mockVoiceInputService.startAudioRecording).toHaveBeenCalled()
  })

  test('should handle complete session flow', async () => {
    const { ItoSession } = await import('./itoSession')
    const session = new ItoSession()

    const mockTranscript = 'Test complete flow'
    mockItoStreamController.startGrpcStream.mockResolvedValueOnce({
      response: { transcript: mockTranscript },
      audioBuffer: Buffer.from('audio-data'),
      sampleRate: 16000,
    })

    // Start session
    await session.startSession(ItoMode.TRANSCRIBE)

    expect(mockItoStreamController.startInteraction).toHaveBeenCalled()
    expect(mockVoiceInputService.startAudioRecording).toHaveBeenCalled()

    // Complete session
    await session.completeSession()

    expect(mockVoiceInputService.stopAudioRecording).toHaveBeenCalled()
    expect(mockItoStreamController.endInteraction).toHaveBeenCalled()
    expect(mockTextInserter.insertText).toHaveBeenCalledWith(mockTranscript)
    expect(mockRecordingStateNotifier.notifyRecordingStopped).toHaveBeenCalled()
  })
})
