import { describe, test, expect, beforeEach } from 'bun:test'
import { AudioStreamManager } from './AudioStreamManager'

describe('AudioStreamManager', () => {
  let audioManager: AudioStreamManager

  beforeEach(() => {
    audioManager = new AudioStreamManager()
  })

  describe('Basic Streaming Control', () => {
    test('should start and stop streaming correctly', () => {
      expect(audioManager.isCurrentlyStreaming()).toBe(false)

      audioManager.startStreaming()
      expect(audioManager.isCurrentlyStreaming()).toBe(true)

      audioManager.stopStreaming()
      expect(audioManager.isCurrentlyStreaming()).toBe(false)
    })

    test('should clear audio on start', () => {
      // Add some chunks
      audioManager.startStreaming()
      audioManager.addAudioChunk(Buffer.from('test'))
      audioManager.stopStreaming()

      // Start again - should be clean
      audioManager.startStreaming()
      const buffer = audioManager.getInteractionAudioBuffer()
      expect(buffer.length).toBe(0)
    })
  })

  describe('Audio Chunk Management', () => {
    test('should accumulate audio chunks', () => {
      audioManager.startStreaming()

      const chunk1 = Buffer.from('chunk1')
      const chunk2 = Buffer.from('chunk2')

      audioManager.addAudioChunk(chunk1)
      audioManager.addAudioChunk(chunk2)

      const buffer = audioManager.getInteractionAudioBuffer()
      expect(buffer).toEqual(Buffer.concat([chunk1, chunk2]))
    })

    test('should ignore chunks when not streaming', () => {
      const chunk = Buffer.from('test')
      audioManager.addAudioChunk(chunk)

      const buffer = audioManager.getInteractionAudioBuffer()
      expect(buffer.length).toBe(0)
    })

    test('should clear interaction audio', () => {
      audioManager.startStreaming()
      audioManager.addAudioChunk(Buffer.from('test'))

      audioManager.clearInteractionAudio()
      const buffer = audioManager.getInteractionAudioBuffer()
      expect(buffer.length).toBe(0)
    })
  })

  describe('Audio Configuration', () => {
    test('should set sample rate', () => {
      expect(audioManager.getCurrentSampleRate()).toBe(16000) // default

      audioManager.setAudioConfig({ sampleRate: 44100 })
      expect(audioManager.getCurrentSampleRate()).toBe(44100)
    })

    test('should ignore invalid sample rates', () => {
      audioManager.setAudioConfig({ sampleRate: 0 })
      expect(audioManager.getCurrentSampleRate()).toBe(16000) // unchanged

      audioManager.setAudioConfig({ sampleRate: -1 })
      expect(audioManager.getCurrentSampleRate()).toBe(16000) // unchanged
    })

    test('should handle channels config gracefully', () => {
      // Should not throw error even though channels isn't used
      expect(() => {
        audioManager.setAudioConfig({ channels: 2 })
      }).not.toThrow()
    })
  })

  describe('Audio Buffering and Duration Calculation', () => {
    test('should calculate duration correctly for 16kHz audio', () => {
      audioManager.startStreaming()

      // 16kHz, 16-bit mono = 2 bytes per sample
      // 1600 samples = 0.1 seconds = 100ms
      const bytes = 1600 * 2 // 3200 bytes
      const chunk = Buffer.alloc(bytes)

      audioManager.addAudioChunk(chunk)
      expect(audioManager.getBufferedDurationMs()).toBe(100)
    })

    test('should calculate duration correctly for different sample rates', () => {
      audioManager.setAudioConfig({ sampleRate: 8000 })
      audioManager.startStreaming()

      // 8kHz, 16-bit mono = 2 bytes per sample
      // 800 samples = 0.1 seconds = 100ms
      const bytes = 800 * 2 // 1600 bytes
      const chunk = Buffer.alloc(bytes)

      audioManager.addAudioChunk(chunk)
      expect(audioManager.getBufferedDurationMs()).toBe(100)
    })

    test('should check minimum duration threshold', () => {
      audioManager.startStreaming()

      expect(audioManager.hasMinimumDuration()).toBe(false)

      // Add 100ms worth of audio (1600 samples * 2 bytes)
      const chunk = Buffer.alloc(3200)
      audioManager.addAudioChunk(chunk)

      expect(audioManager.hasMinimumDuration()).toBe(true)
    })
  })

  describe('Audio Streaming with Buffering', () => {
    test('should wait for minimum duration before streaming', async () => {
      audioManager.startStreaming()

      const streamPromise = audioManager.streamAudioChunks()
      const iterator = streamPromise[Symbol.asyncIterator]()

      // Should not yield anything yet - waiting for minimum duration
      const shortChunk = Buffer.alloc(100) // Very small chunk
      audioManager.addAudioChunk(shortChunk)

      // Try to get next value with a timeout to avoid hanging
      const timeoutPromise = new Promise(resolve =>
        setTimeout(() => resolve('timeout'), 50),
      )
      const result = await Promise.race([iterator.next(), timeoutPromise])

      expect(result).toBe('timeout') // Should timeout waiting for minimum duration
    })

    test('should start streaming after minimum duration is reached', async () => {
      audioManager.startStreaming()

      const streamPromise = audioManager.streamAudioChunks()
      const iterator = streamPromise[Symbol.asyncIterator]()

      // Add minimum duration worth of audio
      const minimumChunk = Buffer.alloc(3200) // 100ms at 16kHz
      audioManager.addAudioChunk(minimumChunk)

      // Should now yield the chunk
      const result = await iterator.next()
      expect(result.done).toBe(false)
      expect(result.value).toHaveProperty('audioData')
      expect(result.value.audioData).toEqual(minimumChunk)
    })

    test('should continue streaming additional chunks', async () => {
      audioManager.startStreaming()

      // Add minimum duration first
      const minimumChunk = Buffer.alloc(3200) // 100ms
      audioManager.addAudioChunk(minimumChunk)

      const streamPromise = audioManager.streamAudioChunks()
      const iterator = streamPromise[Symbol.asyncIterator]()

      // Get first chunk (minimum duration)
      await iterator.next()

      // Add another chunk
      const additionalChunk = Buffer.from('additional')
      audioManager.addAudioChunk(additionalChunk)

      // Should yield the additional chunk
      const result = await iterator.next()
      expect(result.done).toBe(false)
      expect(result.value.audioData).toEqual(additionalChunk)
    })

    test('should finish streaming when stopped', async () => {
      audioManager.startStreaming()

      // Add minimum duration
      const chunk = Buffer.alloc(3200)
      audioManager.addAudioChunk(chunk)

      const streamPromise = audioManager.streamAudioChunks()
      const iterator = streamPromise[Symbol.asyncIterator]()

      // Get first chunk
      await iterator.next()

      // Stop streaming
      audioManager.stopStreaming()

      // Should finish
      const result = await iterator.next()
      expect(result.done).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    test('should handle empty chunks', () => {
      audioManager.startStreaming()

      const emptyChunk = Buffer.alloc(0)
      audioManager.addAudioChunk(emptyChunk)

      expect(audioManager.getBufferedDurationMs()).toBe(0)
      expect(audioManager.hasMinimumDuration()).toBe(false)
    })

    test('should handle very small chunks', () => {
      audioManager.startStreaming()

      const tinyChunk = Buffer.alloc(1) // 1 byte
      audioManager.addAudioChunk(tinyChunk)

      // Should be < 1ms duration
      expect(audioManager.getBufferedDurationMs()).toBe(0) // Floors to 0
    })

    test('should reset buffered duration on restart', () => {
      audioManager.startStreaming()
      audioManager.addAudioChunk(Buffer.alloc(3200)) // 100ms
      expect(audioManager.getBufferedDurationMs()).toBe(100)

      audioManager.stopStreaming()
      audioManager.startStreaming()

      expect(audioManager.getBufferedDurationMs()).toBe(0)
    })
  })
})
