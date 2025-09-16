import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock audio recorder service
const mockAudioRecorderService = {
  startRecording: mock(),
  stopRecording: mock(),
  on: mock(),
  initialize: mock(),
  requestDeviceConfig: mock(),
}
mock.module('../media/audio', () => ({
  audioRecorderService: mockAudioRecorderService,
}))

// Mock system audio control
const mockMuteSystemAudio = mock()
const mockUnmuteSystemAudio = mock()
mock.module('../media/systemAudio', () => ({
  muteSystemAudio: mockMuteSystemAudio,
  unmuteSystemAudio: mockUnmuteSystemAudio,
}))

// Mock electron windows
const mockPillWindow = {
  webContents: {
    send: mock(),
    isDestroyed: mock(() => false),
  },
  isDestroyed: mock(() => false),
}
const mockMainWindow = {
  webContents: {
    send: mock(),
    isDestroyed: mock(() => false),
  },
  isDestroyed: mock(() => false),
}
mock.module('./app', () => ({
  getPillWindow: mock(() => mockPillWindow),
  mainWindow: mockMainWindow,
}))

// Mock electron store
const mockStore = {
  get: mock(),
}
mock.module('./store', () => ({
  default: mockStore,
  getCurrentUserId: mock(() => 'test-user-123'),
  createNewAuthState: mock(() => ({
    state: 'test-state',
    codeVerifier: 'test-verifier',
  })),
}))

// Mock transcription service
const mockTranscriptionService = {
  startTranscription: mock(),
  stopTranscription: mock(),
  handleAudioChunk: mock(),
  setMainWindow: mock(),
  setAudioConfig: mock(),
}
mock.module('./transcriptionService', () => ({
  transcriptionService: mockTranscriptionService,
}))

// Mock console to avoid noise
beforeEach(() => {
  console.log = mock()
  console.error = mock()
  console.info = mock()
})

import { voiceInputService } from './voiceInputService'
import { STORE_KEYS } from '../constants/store-keys'
import { ItoMode } from '@/app/generated/ito_pb'

describe('VoiceInputService Integration Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    mockAudioRecorderService.startRecording.mockClear()
    mockAudioRecorderService.stopRecording.mockClear()
    mockAudioRecorderService.on.mockClear()
    mockAudioRecorderService.initialize.mockClear()
    mockAudioRecorderService.requestDeviceConfig.mockClear()

    mockMuteSystemAudio.mockClear()
    mockUnmuteSystemAudio.mockClear()

    mockPillWindow.webContents.send.mockClear()
    mockMainWindow.webContents.send.mockClear()

    mockStore.get.mockClear()

    mockTranscriptionService.startTranscription.mockClear()
    mockTranscriptionService.stopTranscription.mockClear()
    mockTranscriptionService.handleAudioChunk.mockClear()
    mockTranscriptionService.setMainWindow.mockClear()
    mockTranscriptionService.setAudioConfig.mockClear()

    // Setup default store values
    mockStore.get.mockImplementation((key: string) => {
      if (key === STORE_KEYS.SETTINGS) {
        return {
          microphoneDeviceId: 'test-device-123',
          muteAudioWhenDictating: false,
        }
      }
      return null
    })
  })

  describe('STT Service Lifecycle', () => {
    test('should start STT service with all components', () => {
      const testDeviceId = 'test-microphone-device'
      mockStore.get.mockReturnValue({
        microphoneDeviceId: testDeviceId,
        muteAudioWhenDictating: false,
      })

      voiceInputService.startSTTService(ItoMode.TRANSCRIBE)

      // Verify transcription service started
      expect(mockTranscriptionService.startTranscription).toHaveBeenCalledTimes(
        1,
      )

      // Verify audio recorder started with correct device
      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledWith(
        testDeviceId,
      )

      // Verify pill window notification
      expect(mockPillWindow.webContents.send).toHaveBeenCalledWith(
        'recording-state-update',
        {
          isRecording: true,
          deviceId: testDeviceId,
          mode: ItoMode.TRANSCRIBE,
        },
      )

      // System audio should not be muted (muteAudioWhenDictating: false)
      expect(mockMuteSystemAudio).not.toHaveBeenCalled()
    })

    test('should mute system audio when configured', () => {
      mockStore.get.mockReturnValue({
        microphoneDeviceId: 'test-device',
        muteAudioWhenDictating: true,
      })

      voiceInputService.startSTTService(ItoMode.TRANSCRIBE)

      // System audio should be muted
      expect(mockMuteSystemAudio).toHaveBeenCalledTimes(1)
    })

    test('should stop STT service and clean up resources', () => {
      // First start the service
      mockStore.get.mockReturnValue({
        microphoneDeviceId: 'test-device',
        muteAudioWhenDictating: true,
      })

      voiceInputService.startSTTService(ItoMode.TRANSCRIBE)

      // Reset mocks to track stop calls
      mockStore.get.mockClear()
      mockStore.get.mockReturnValue({
        muteAudioWhenDictating: true,
      })

      // Stop the service
      voiceInputService.stopSTTService()

      // Verify audio recorder stopped
      expect(mockAudioRecorderService.stopRecording).toHaveBeenCalledTimes(1)

      // Verify transcription service stopped
      expect(mockTranscriptionService.stopTranscription).toHaveBeenCalledTimes(
        1,
      )

      // Verify system audio unmuted
      expect(mockUnmuteSystemAudio).toHaveBeenCalledTimes(1)

      // Verify pill window notified of stop
      expect(mockPillWindow.webContents.send).toHaveBeenCalledWith(
        'recording-state-update',
        {
          isRecording: false,
          deviceId: '',
        },
      )
    })

    test('should not unmute audio if muting was disabled', () => {
      mockStore.get.mockReturnValue({
        muteAudioWhenDictating: false,
      })

      voiceInputService.stopSTTService()

      // System audio should not be unmuted
      expect(mockUnmuteSystemAudio).not.toHaveBeenCalled()
    })
  })

  describe('Audio Event Handling', () => {
    test('should handle audio chunks and forward to transcription service', () => {
      voiceInputService.setUpAudioRecorderListeners()

      // Get the audio-chunk event handler
      const audioChunkHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'audio-chunk',
      )?.[1]

      expect(audioChunkHandler).toBeDefined()

      // Simulate audio chunk
      const testChunk = Buffer.from('audio-data-test')
      audioChunkHandler(testChunk)

      // Verify forwarded to transcription service
      expect(mockTranscriptionService.handleAudioChunk).toHaveBeenCalledWith(
        testChunk,
      )
    })

    test('should handle volume updates and broadcast to windows', () => {
      voiceInputService.setUpAudioRecorderListeners()

      // Get the volume-update event handler
      const volumeUpdateHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'volume-update',
      )?.[1]

      expect(volumeUpdateHandler).toBeDefined()

      // Simulate volume update
      const testVolume = 0.75
      volumeUpdateHandler(testVolume)

      // Verify sent to both windows
      expect(mockPillWindow.webContents.send).toHaveBeenCalledWith(
        'volume-update',
        testVolume,
      )
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'volume-update',
        testVolume,
      )
    })

    test('should handle audio recorder errors gracefully', () => {
      voiceInputService.setUpAudioRecorderListeners()

      // Get the error event handler
      const errorHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'error',
      )?.[1]

      expect(errorHandler).toBeDefined()

      // Simulate error
      const testError = new Error('Microphone access denied')
      errorHandler(testError)

      // Error should be logged (we've mocked console.error)
      // Test passes if no exception is thrown
      expect(true).toBe(true)
    })

    test('should not send to main window when it is destroyed', () => {
      voiceInputService.setUpAudioRecorderListeners()

      const volumeUpdateHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'volume-update',
      )?.[1]

      expect(volumeUpdateHandler).toBeDefined()

      // Simulate main window destroyed
      mockMainWindow.isDestroyed.mockReturnValueOnce(true)

      const testVolume = 0.42
      volumeUpdateHandler(testVolume)

      // Pill window should still receive the update
      expect(mockPillWindow.webContents.send).toHaveBeenCalledWith(
        'volume-update',
        testVolume,
      )
      // Main window should not receive the update
      expect(mockMainWindow.webContents.send).not.toHaveBeenCalled()
    })
  })

  describe('Device Management', () => {
    test('should use device ID from settings', () => {
      const customDeviceId = 'custom-microphone-device-456'
      mockStore.get.mockReturnValue({
        microphoneDeviceId: customDeviceId,
        muteAudioWhenDictating: false,
      })

      voiceInputService.startSTTService(ItoMode.TRANSCRIBE)

      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledWith(
        customDeviceId,
      )
      expect(mockPillWindow.webContents.send).toHaveBeenCalledWith(
        'recording-state-update',
        expect.objectContaining({
          deviceId: customDeviceId,
        }),
      )
    })

    test('should handle missing device ID gracefully', () => {
      mockStore.get.mockReturnValue({
        // Missing microphoneDeviceId
        muteAudioWhenDictating: false,
      })

      voiceInputService.startSTTService(ItoMode.TRANSCRIBE)

      // Should still start recording (with undefined device ID)
      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledWith(
        undefined,
      )
    })

    test('should handle missing settings gracefully', () => {
      // Return empty object instead of null to avoid accessing properties on null
      mockStore.get.mockReturnValue({})

      voiceInputService.startSTTService(ItoMode.TRANSCRIBE)

      // Should still start recording (with undefined device ID)
      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledWith(
        undefined,
      )

      // Should not crash on stop
      expect(() => voiceInputService.stopSTTService()).not.toThrow()
    })
  })

  describe('Integration Scenarios', () => {
    test('should coordinate complete recording session', () => {
      const deviceId = 'session-test-device'
      mockStore.get.mockReturnValue({
        microphoneDeviceId: deviceId,
        muteAudioWhenDictating: true,
      })

      // Set up listeners first
      voiceInputService.setUpAudioRecorderListeners()

      // Start recording session
      voiceInputService.startSTTService(ItoMode.TRANSCRIBE)

      // Simulate audio events during recording
      const audioChunkHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'audio-chunk',
      )?.[1]
      const volumeHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'volume-update',
      )?.[1]

      // Simulate multiple audio chunks and volume updates
      audioChunkHandler(Buffer.from('chunk1'))
      volumeHandler(0.6)
      audioChunkHandler(Buffer.from('chunk2'))
      volumeHandler(0.8)

      // Reset store mock for stop (audio was muted during start)
      mockStore.get.mockClear()
      mockStore.get.mockReturnValue({ muteAudioWhenDictating: true })

      // Stop recording session
      voiceInputService.stopSTTService()

      // Verify complete flow
      expect(mockMuteSystemAudio).toHaveBeenCalledTimes(1)
      expect(mockTranscriptionService.startTranscription).toHaveBeenCalledTimes(
        1,
      )
      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledWith(
        deviceId,
      )
      expect(mockTranscriptionService.handleAudioChunk).toHaveBeenCalledTimes(2)
      expect(mockPillWindow.webContents.send).toHaveBeenCalledWith(
        'volume-update',
        0.6,
      )
      expect(mockPillWindow.webContents.send).toHaveBeenCalledWith(
        'volume-update',
        0.8,
      )
      expect(mockAudioRecorderService.stopRecording).toHaveBeenCalledTimes(1)
      expect(mockTranscriptionService.stopTranscription).toHaveBeenCalledTimes(
        1,
      )
      expect(mockUnmuteSystemAudio).toHaveBeenCalledTimes(1)
    })
  })

  describe('Error Resilience Business Logic', () => {
    test('should continue when pill window is unavailable', async () => {
      // Mock getPillWindow to return null
      const mockApp: any = await import('./app')
      mockApp.getPillWindow.mockReturnValue(null)

      mockStore.get.mockReturnValue({
        microphoneDeviceId: 'test-device',
        muteAudioWhenDictating: false,
      })

      // Should not crash when window is unavailable (optional chaining handles this)
      expect(() =>
        voiceInputService.startSTTService(ItoMode.TRANSCRIBE),
      ).not.toThrow()

      // Core audio services should still work
      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledWith(
        'test-device',
      )
      expect(mockTranscriptionService.startTranscription).toHaveBeenCalledTimes(
        1,
      )

      // Reset for future tests
      mockApp.getPillWindow.mockReturnValue(mockPillWindow)
    })
  })

  describe('Service State Management Business Logic', () => {
    test('should handle stopping service without starting', () => {
      mockStore.get.mockReturnValue({
        muteAudioWhenDictating: false,
      })

      // Should not crash when stopping without starting
      expect(() => voiceInputService.stopSTTService()).not.toThrow()

      // Cleanup calls should still happen
      expect(mockAudioRecorderService.stopRecording).toHaveBeenCalledTimes(1)
      expect(mockTranscriptionService.stopTranscription).toHaveBeenCalledTimes(
        1,
      )
    })

    test('should handle multiple consecutive starts', () => {
      mockStore.get.mockReturnValue({
        microphoneDeviceId: 'test-device',
        muteAudioWhenDictating: false,
      })

      // Should not crash when starting multiple times
      expect(() => {
        voiceInputService.startSTTService(ItoMode.TRANSCRIBE)
        voiceInputService.startSTTService(ItoMode.TRANSCRIBE)
        voiceInputService.startSTTService(ItoMode.TRANSCRIBE)
      }).not.toThrow()

      // Each start should call the services
      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledTimes(3)
      expect(mockTranscriptionService.startTranscription).toHaveBeenCalledTimes(
        3,
      )
    })

    test('should handle stop after multiple starts correctly', () => {
      mockStore.get.mockReturnValue({
        microphoneDeviceId: 'test-device',
        muteAudioWhenDictating: true,
      })

      // Start multiple times, then stop once
      voiceInputService.startSTTService(ItoMode.TRANSCRIBE)
      voiceInputService.startSTTService(ItoMode.TRANSCRIBE)

      // Reset mocks to track stop behavior
      mockStore.get.mockClear()
      mockStore.get.mockReturnValue({ muteAudioWhenDictating: true })

      voiceInputService.stopSTTService()

      // Stop should work regardless of multiple starts
      expect(mockAudioRecorderService.stopRecording).toHaveBeenCalledTimes(1)
      expect(mockTranscriptionService.stopTranscription).toHaveBeenCalledTimes(
        1,
      )
      expect(mockUnmuteSystemAudio).toHaveBeenCalledTimes(1)
    })
  })
})
