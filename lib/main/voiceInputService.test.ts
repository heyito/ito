import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock audio recorder service
const mockAudioRecorderService = {
  startRecording: mock(),
  stopRecording: mock(),
  on: mock(),
  initialize: mock(),
  requestDeviceConfig: mock(),
  awaitDrainComplete: mock(() => Promise.resolve()),
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

mock.module('electron-log', () => ({
  default: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}))

// Mock console to avoid noise
beforeEach(() => {
  console.log = mock()
  console.error = mock()
  console.info = mock()
})

import { voiceInputService } from './voiceInputService'
import { STORE_KEYS } from '../constants/store-keys'

describe('VoiceInputService', () => {
  beforeEach(() => {
    // Reset all mocks
    mockAudioRecorderService.startRecording.mockClear()
    mockAudioRecorderService.stopRecording.mockClear()
    mockAudioRecorderService.on.mockClear()
    mockAudioRecorderService.initialize.mockClear()
    mockAudioRecorderService.requestDeviceConfig.mockClear()
    mockAudioRecorderService.awaitDrainComplete.mockClear()
    mockAudioRecorderService.awaitDrainComplete.mockResolvedValue(undefined)

    mockMuteSystemAudio.mockClear()
    mockUnmuteSystemAudio.mockClear()

    mockPillWindow.webContents.send.mockClear()
    mockMainWindow.webContents.send.mockClear()

    mockStore.get.mockClear()

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

  describe('Audio Recording Lifecycle', () => {
    test('should start audio recording with device from settings', () => {
      const testDeviceId = 'test-microphone-device'
      mockStore.get.mockReturnValue({
        microphoneDeviceId: testDeviceId,
        muteAudioWhenDictating: false,
      })

      voiceInputService.startAudioRecording()

      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledWith(
        testDeviceId,
      )
      expect(mockMuteSystemAudio).not.toHaveBeenCalled()
    })

    test('should mute system audio when configured', () => {
      mockStore.get.mockReturnValue({
        microphoneDeviceId: 'test-device',
        muteAudioWhenDictating: true,
      })

      voiceInputService.startAudioRecording()

      expect(mockMuteSystemAudio).toHaveBeenCalledTimes(1)
      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledWith(
        'test-device',
      )
    })

    test('should stop audio recording and wait for drain', async () => {
      mockStore.get.mockReturnValue({
        muteAudioWhenDictating: false,
      })

      await voiceInputService.stopAudioRecording()

      expect(mockAudioRecorderService.stopRecording).toHaveBeenCalledTimes(1)
      expect(mockAudioRecorderService.awaitDrainComplete).toHaveBeenCalledWith(
        500,
      )
      expect(mockUnmuteSystemAudio).not.toHaveBeenCalled()
    })

    test('should unmute system audio when stopping if it was muted', async () => {
      mockStore.get.mockReturnValue({
        muteAudioWhenDictating: true,
      })

      await voiceInputService.stopAudioRecording()

      expect(mockAudioRecorderService.stopRecording).toHaveBeenCalledTimes(1)
      expect(mockUnmuteSystemAudio).toHaveBeenCalledTimes(1)
    })

    test('should handle drain timeout gracefully', async () => {
      mockAudioRecorderService.awaitDrainComplete.mockRejectedValueOnce(
        new Error('Drain timeout'),
      )
      mockStore.get.mockReturnValue({
        muteAudioWhenDictating: false,
      })

      await voiceInputService.stopAudioRecording()

      expect(mockAudioRecorderService.stopRecording).toHaveBeenCalledTimes(1)
      // Should not throw and continue with cleanup
    })
  })

  describe('Audio Recorder Listeners', () => {
    test('should set up volume update listener', () => {
      voiceInputService.setUpAudioRecorderListeners()

      expect(mockAudioRecorderService.on).toHaveBeenCalledWith(
        'volume-update',
        expect.any(Function),
      )
      expect(mockAudioRecorderService.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      )
      expect(mockAudioRecorderService.initialize).toHaveBeenCalledTimes(1)
    })

    test('should broadcast volume updates to windows', () => {
      voiceInputService.setUpAudioRecorderListeners()

      const volumeUpdateHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'volume-update',
      )?.[1]

      expect(volumeUpdateHandler).toBeDefined()

      const testVolume = 0.75
      volumeUpdateHandler(testVolume)

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

      const errorHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'error',
      )?.[1]

      expect(errorHandler).toBeDefined()

      const testError = new Error('Microphone access denied')
      errorHandler(testError)

      // Error should be logged - test passes if no exception is thrown
      expect(true).toBe(true)
    })

    test('should not send to main window when it is destroyed', () => {
      voiceInputService.setUpAudioRecorderListeners()

      const volumeUpdateHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'volume-update',
      )?.[1]

      expect(volumeUpdateHandler).toBeDefined()

      mockMainWindow.isDestroyed.mockReturnValueOnce(true)

      const testVolume = 0.42
      volumeUpdateHandler(testVolume)

      expect(mockPillWindow.webContents.send).toHaveBeenCalledWith(
        'volume-update',
        testVolume,
      )
      expect(mockMainWindow.webContents.send).not.toHaveBeenCalled()
    })

    test('should not send to main window when webContents is destroyed', () => {
      voiceInputService.setUpAudioRecorderListeners()

      const volumeUpdateHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'volume-update',
      )?.[1]

      expect(volumeUpdateHandler).toBeDefined()

      mockMainWindow.webContents.isDestroyed.mockReturnValueOnce(true)

      const testVolume = 0.55
      volumeUpdateHandler(testVolume)

      expect(mockPillWindow.webContents.send).toHaveBeenCalledWith(
        'volume-update',
        testVolume,
      )
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

      voiceInputService.startAudioRecording()

      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledWith(
        customDeviceId,
      )
    })

    test('should handle missing device ID gracefully', () => {
      mockStore.get.mockReturnValue({
        // Missing microphoneDeviceId
        muteAudioWhenDictating: false,
      })

      voiceInputService.startAudioRecording()

      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledWith(
        undefined,
      )
    })

    test('should handle microphone change', () => {
      const newDeviceId = 'new-device-789'

      voiceInputService.handleMicrophoneChanged(newDeviceId)

      expect(mockAudioRecorderService.requestDeviceConfig).toHaveBeenCalledWith(
        newDeviceId,
      )
    })
  })

  describe('Error Resilience', () => {
    test('should continue when pill window is unavailable', async () => {
      const mockApp: any = await import('./app')
      mockApp.getPillWindow.mockReturnValueOnce(null)

      voiceInputService.setUpAudioRecorderListeners()

      const volumeUpdateHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'volume-update',
      )?.[1]

      // Should not crash when window is unavailable
      expect(() => volumeUpdateHandler(0.5)).not.toThrow()

      // Reset mock for future tests
      mockApp.getPillWindow.mockReturnValue(mockPillWindow)
    })

    test('should handle multiple volume updates', () => {
      voiceInputService.setUpAudioRecorderListeners()

      const volumeUpdateHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'volume-update',
      )?.[1]

      volumeUpdateHandler(0.1)
      volumeUpdateHandler(0.5)
      volumeUpdateHandler(0.9)

      expect(mockPillWindow.webContents.send).toHaveBeenCalledTimes(3)
      expect(mockMainWindow.webContents.send).toHaveBeenCalledTimes(3)
    })
  })

  describe('Integration Scenarios', () => {
    test('should coordinate complete recording session', async () => {
      const deviceId = 'session-test-device'
      mockStore.get.mockReturnValue({
        microphoneDeviceId: deviceId,
        muteAudioWhenDictating: true,
      })

      // Set up listeners
      voiceInputService.setUpAudioRecorderListeners()

      // Start recording
      voiceInputService.startAudioRecording()

      expect(mockMuteSystemAudio).toHaveBeenCalledTimes(1)
      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledWith(
        deviceId,
      )

      // Simulate volume updates
      const volumeHandler = mockAudioRecorderService.on.mock.calls.find(
        call => call[0] === 'volume-update',
      )?.[1]
      volumeHandler(0.6)
      volumeHandler(0.8)

      // Stop recording
      await voiceInputService.stopAudioRecording()

      expect(mockAudioRecorderService.stopRecording).toHaveBeenCalledTimes(1)
      expect(mockUnmuteSystemAudio).toHaveBeenCalledTimes(1)
      expect(mockPillWindow.webContents.send).toHaveBeenCalledWith(
        'volume-update',
        0.6,
      )
      expect(mockPillWindow.webContents.send).toHaveBeenCalledWith(
        'volume-update',
        0.8,
      )
    })

    test('should handle multiple start/stop cycles', async () => {
      mockStore.get.mockReturnValue({
        microphoneDeviceId: 'test-device',
        muteAudioWhenDictating: false,
      })

      // First cycle
      voiceInputService.startAudioRecording()
      await voiceInputService.stopAudioRecording()

      // Second cycle
      voiceInputService.startAudioRecording()
      await voiceInputService.stopAudioRecording()

      expect(mockAudioRecorderService.startRecording).toHaveBeenCalledTimes(2)
      expect(mockAudioRecorderService.stopRecording).toHaveBeenCalledTimes(2)
    })
  })
})
