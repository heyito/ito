import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock external boundaries only - let internal logic run naturally

// Mock gRPC client
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

// Mock electron BrowserWindow
const mockBrowserWindow = {
  webContents: {
    send: mock(),
  },
}
mock.module('electron', () => ({
  BrowserWindow: {
    getAllWindows: mock(() => [mockBrowserWindow]),
  },
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

// Mock console to avoid noise
beforeEach(() => {
  console.log = mock()
  console.error = mock()
})

import { transcriptionService } from './transcriptionService'
import { STORE_KEYS } from '../constants/store-keys'

// Helper function to wait for database interaction to be created
const waitForInteractionCreation = async () => {
  const start = Date.now()
  const maxWait = 500 // 500ms timeout

  while (mockDbRun.mock.calls.length === 0) {
    if (Date.now() - start > maxWait) {
      throw new Error('Timed out waiting for interaction creation')
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

describe('TranscriptionService Integration Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    mockGrpcClient.transcribeStream.mockClear()
    mockMainStore.get.mockClear()
    mockBrowserWindow.webContents.send.mockClear()

    // Reset database utility mocks
    mockDbRun.mockClear()
    mockDbGet.mockClear()
    mockDbAll.mockClear()

    // Setup default user profile
    mockMainStore.get.mockImplementation((key: string) => {
      if (key === STORE_KEYS.USER_PROFILE) {
        return { id: 'test-user-123' }
      }
      return null
    })
  })

  describe('Complete Transcription Workflow', () => {
    test('should handle successful transcription end-to-end', async () => {
      // Mock successful gRPC response
      const mockTranscript = 'Hello world, this is a test transcription'
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: mockTranscript,
      })
      mockDbRun.mockResolvedValue(undefined)

      // Start streaming
      transcriptionService.startStreaming()
      expect(mockGrpcClient.transcribeStream).toHaveBeenCalledTimes(1)

      // Simulate audio chunks
      const audioChunk1 = Buffer.from('audio-data-1')
      const audioChunk2 = Buffer.from('audio-data-2')
      transcriptionService.forwardAudioChunk(audioChunk1)
      transcriptionService.forwardAudioChunk(audioChunk2)

      // Stop streaming
      transcriptionService.stopStreaming()

      // Wait for interaction creation to complete
      await waitForInteractionCreation()

      // Verify interaction was created in database
      expect(mockDbRun).toHaveBeenCalled()

      // Verify window notification
      expect(mockBrowserWindow.webContents.send).toHaveBeenCalledWith(
        'interaction-created',
        expect.objectContaining({
          transcript: mockTranscript,
          durationMs: expect.any(Number),
        }),
      )
    })

    test('should handle transcription errors gracefully', async () => {
      // Mock gRPC error
      const errorMessage = 'Network timeout'
      mockGrpcClient.transcribeStream.mockRejectedValueOnce(
        new Error(errorMessage),
      )
      mockDbRun.mockResolvedValue(undefined)

      // Start and process
      transcriptionService.startStreaming()
      transcriptionService.forwardAudioChunk(Buffer.from('audio-data'))
      transcriptionService.stopStreaming()

      // Wait for interaction creation to complete
      await waitForInteractionCreation()

      // Should still create interaction with error info
      expect(mockDbRun).toHaveBeenCalled()
    })

    test('should skip interaction creation when no user profile', async () => {
      // Mock no user profile
      mockMainStore.get.mockReturnValue(null)
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: 'test',
      })

      transcriptionService.startStreaming()
      transcriptionService.stopStreaming()

      // Wait a reasonable amount of time for any potential processing
      await new Promise(resolve => setTimeout(resolve, 50))

      // Should not create interaction
      expect(mockDbRun).not.toHaveBeenCalled()
      expect(mockBrowserWindow.webContents.send).not.toHaveBeenCalled()
    })
  })

  describe('Streaming State Management', () => {
    test('should prevent multiple simultaneous streams', () => {
      // Start first stream
      transcriptionService.startStreaming()
      const firstCallCount = mockGrpcClient.transcribeStream.mock.calls.length

      // Try to start again - should be ignored
      transcriptionService.startStreaming()
      const secondCallCount = mockGrpcClient.transcribeStream.mock.calls.length

      // Should not increase call count
      expect(secondCallCount).toBe(firstCallCount)
    })

    test('should handle stop when not streaming', () => {
      // Should not throw error
      expect(() => transcriptionService.stopStreaming()).not.toThrow()
    })

    test('should ignore audio chunks when not streaming', () => {
      // Don't start streaming
      transcriptionService.forwardAudioChunk(Buffer.from('audio'))

      // Should not cause any side effects
      expect(mockGrpcClient.transcribeStream).not.toHaveBeenCalled()
    })
  })

  describe('Audio Processing', () => {
    test('should accumulate audio chunks correctly', async () => {
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: 'test',
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()

      // Add multiple chunks of different sizes
      const chunks = [
        Buffer.from('chunk1'),
        Buffer.from('chunk2-longer'),
        Buffer.from('c3'),
      ]

      chunks.forEach(chunk => {
        transcriptionService.forwardAudioChunk(chunk)
      })

      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      // Verify correct accumulation and database save
      expect(mockDbRun).toHaveBeenCalled()
    })

    test('should handle empty audio stream', async () => {
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: 'silence detected',
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()
      // Don't add any chunks
      transcriptionService.stopStreaming()

      await waitForInteractionCreation()

      // Verify empty stream handled correctly
      expect(mockDbRun).toHaveBeenCalled()
    })
  })

  describe('Timing and Duration', () => {
    test('should calculate interaction duration accurately', async () => {
      // Create a promise that resolves after a delay to simulate real transcription timing
      let resolveTranscription: (value: { transcript: string }) => void
      const transcriptionPromise = new Promise<{ transcript: string }>(
        resolve => {
          resolveTranscription = resolve
        },
      )

      mockGrpcClient.transcribeStream.mockReturnValueOnce(transcriptionPromise)
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()

      // Simulate some processing time before resolving
      await new Promise(resolve => setTimeout(resolve, 50))

      // Now resolve the transcription
      resolveTranscription!({ transcript: 'test' })

      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      // Verify that mockDbRun was called and get the call details
      expect(mockDbRun.mock.calls.length).toBeGreaterThan(0)
      const call = mockDbRun.mock.calls[0] as any
      expect(call).toBeDefined()
      expect(call[1]).toBeDefined() // parameters array should exist

      const durationParam = call[1][6] // duration_ms is at index 6 in the parameters array

      expect(durationParam).toBeGreaterThan(40) // At least ~50ms
      expect(durationParam).toBeLessThan(200) // But not too long
    })
  })

  describe('Database Error Handling', () => {
    test('should handle database save failures gracefully', async () => {
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: 'test',
      })
      // Mock database error
      mockDbRun.mockRejectedValueOnce(new Error('Database error'))

      transcriptionService.startStreaming()
      transcriptionService.stopStreaming()

      // Wait for the error handling to complete
      await new Promise(resolve => setTimeout(resolve, 50))

      // Should not crash - error should be logged
      expect(true).toBe(true) // Test passes if no exception thrown
    })
  })

  describe('Title Generation Business Logic', () => {
    test('should truncate long transcripts at 50 characters', async () => {
      const longTranscript =
        'This is a very long transcript that should be truncated because it exceeds fifty characters'
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: longTranscript,
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()
      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      // Get the database call arguments
      expect(mockDbRun).toHaveBeenCalled()
      const dbCall = mockDbRun.mock.calls[0] as any
      const titleParam = dbCall[1][2] // title is at index 2

      expect(titleParam).toBe(
        'This is a very long transcript that should be trun...',
      )
      expect(titleParam.length).toBe(53) // 50 + '...'
    })

    test('should preserve short transcripts as-is', async () => {
      const shortTranscript = 'Short message'
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: shortTranscript,
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()
      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      const dbCall = mockDbRun.mock.calls[0] as any
      const titleParam = dbCall[1][2]

      expect(titleParam).toBe(shortTranscript)
    })

    test('should use fallback title for empty transcript', async () => {
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: '',
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()
      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      const dbCall = mockDbRun.mock.calls[0] as any
      const titleParam = dbCall[1][2]

      expect(titleParam).toBe('Voice interaction')
    })

    test('should handle exactly 50 character transcript', async () => {
      const exactTranscript = 'A'.repeat(50) // Exactly 50 characters
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: exactTranscript,
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()
      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      const dbCall = mockDbRun.mock.calls[0] as any
      const titleParam = dbCall[1][2]

      expect(titleParam).toBe(exactTranscript) // Should not be truncated
      expect(titleParam.length).toBe(50)
    })
  })

  describe('ASR Output Calculations Business Logic', () => {
    test('should correctly count audio chunks and calculate total bytes', async () => {
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: 'test',
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()

      // Add chunks of known sizes
      const chunk1 = Buffer.from('12345') // 5 bytes
      const chunk2 = Buffer.from('abcdefgh') // 8 bytes
      const chunk3 = Buffer.from('xy') // 2 bytes

      transcriptionService.forwardAudioChunk(chunk1)
      transcriptionService.forwardAudioChunk(chunk2)
      transcriptionService.forwardAudioChunk(chunk3)

      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      // Get ASR output from database call
      const dbCall = mockDbRun.mock.calls[0] as any
      const asrOutputParam = JSON.parse(dbCall[1][3]) // asr_output is at index 3

      expect(asrOutputParam.audioChunkCount).toBe(3)
      expect(asrOutputParam.totalAudioBytes).toBe(15) // 5 + 8 + 2
    })

    test('should handle zero audio chunks correctly', async () => {
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: 'test',
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()
      // Don't add any chunks
      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      const dbCall = mockDbRun.mock.calls[0] as any
      const asrOutputParam = JSON.parse(dbCall[1][3])

      expect(asrOutputParam.audioChunkCount).toBe(0)
      expect(asrOutputParam.totalAudioBytes).toBe(0)
    })

    test('should not create interaction when transcription fails due to short audio', async () => {
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: '',
        error: {
          code: 'CLIENT_AUDIO_TOO_SHORT',
          type: 'audio',
          message: 'Audio file is too short for transcription.',
          provider: 'groq',
        },
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()
      transcriptionService.forwardAudioChunk(Buffer.from('audio'))
      transcriptionService.stopStreaming()

      await expect(waitForInteractionCreation()).rejects.toThrow()

      expect(mockDbRun).not.toHaveBeenCalled()
    })

    test('should include error information in ASR output when transcription fails', async () => {
      const errorMessage = 'Transcription service unavailable'
      mockGrpcClient.transcribeStream.mockRejectedValueOnce(
        new Error(errorMessage),
      )
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()
      transcriptionService.forwardAudioChunk(Buffer.from('audio'))
      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      const dbCall = mockDbRun.mock.calls[0] as any
      const asrOutputParam = JSON.parse(dbCall[1][3])

      expect(asrOutputParam.error).toBe(errorMessage)
      expect(asrOutputParam.audioChunkCount).toBe(1)
    })
  })

  describe('Raw Audio Buffer Business Logic', () => {
    test('should concatenate multiple audio chunks into single buffer', async () => {
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: 'test',
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()

      const chunk1 = Buffer.from([1, 2, 3])
      const chunk2 = Buffer.from([4, 5])
      const chunk3 = Buffer.from([6, 7, 8, 9])

      transcriptionService.forwardAudioChunk(chunk1)
      transcriptionService.forwardAudioChunk(chunk2)
      transcriptionService.forwardAudioChunk(chunk3)

      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      // Get raw audio from database call
      const dbCall = mockDbRun.mock.calls[0] as any
      const rawAudioParam = dbCall[1][5] // raw_audio is at index 5

      expect(rawAudioParam).toBeInstanceOf(Buffer)
      expect(rawAudioParam).toEqual(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]))
    })

    test('should return null for raw audio when no chunks provided', async () => {
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: 'test',
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()
      // Don't add any chunks
      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      const dbCall = mockDbRun.mock.calls[0] as any
      const rawAudioParam = dbCall[1][5]

      expect(rawAudioParam).toBeNull()
    })

    test('should maintain audio data integrity during concatenation', async () => {
      mockGrpcClient.transcribeStream.mockResolvedValueOnce({
        transcript: 'test',
      })
      mockDbRun.mockResolvedValue(undefined)

      transcriptionService.startStreaming()

      // Use binary data that could be corrupted if concatenation is wrong
      const chunk1 = Buffer.from([0xff, 0x00, 0xff])
      const chunk2 = Buffer.from([0x00, 0xff, 0x00])

      transcriptionService.forwardAudioChunk(chunk1)
      transcriptionService.forwardAudioChunk(chunk2)

      transcriptionService.stopStreaming()
      await waitForInteractionCreation()

      const dbCall = mockDbRun.mock.calls[0] as any
      const rawAudioParam = dbCall[1][5]

      expect(rawAudioParam).toEqual(
        Buffer.from([0xff, 0x00, 0xff, 0x00, 0xff, 0x00]),
      )
      expect(rawAudioParam.length).toBe(6)
    })
  })
})
