import { describe, test, expect, beforeEach } from 'bun:test'
import { AudioStreamManager } from './AudioStreamManager'
import { audioRecorderService } from '../../media/audio'

describe('AudioStreamManager', () => {
  let audioManager: AudioStreamManager

  beforeEach(() => {
    audioRecorderService.removeAllListeners('audio-chunk')
    audioRecorderService.removeAllListeners('audio-config')
    audioManager = new AudioStreamManager()
  })

  describe('Basic Streaming Control', () => {
    test('should start and stop streaming correctly', () => {
      expect(audioManager.isCurrentlyStreaming()).toBe(false)

      audioManager.initialize()
      expect(audioManager.isCurrentlyStreaming()).toBe(true)

      audioManager.stopStreaming()
      expect(audioManager.isCurrentlyStreaming()).toBe(false)
    })

    test('should clear audio on start', () => {
      // Add some chunks
      audioManager.initialize()
      audioManager.addAudioChunk(Buffer.from('test'))
      audioManager.stopStreaming()

      // Start again - should be clean
      audioManager.initialize()
      const buffer = audioManager.getInteractionAudioBuffer()
      expect(buffer.length).toBe(0)
    })
  })

  describe('Audio Chunk Management', () => {
    test('should accumulate audio chunks', () => {
      audioManager.initialize()

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
      audioManager.initialize()
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
  })

  describe('Audio Duration Calculation', () => {
    test('should calculate duration correctly for 16kHz audio', () => {
      audioManager.initialize()

      // 16kHz, 16-bit mono = 2 bytes per sample
      // 1600 samples = 0.1 seconds = 100ms
      const bytes = 1600 * 2 // 3200 bytes
      const chunk = Buffer.alloc(bytes)

      audioManager.addAudioChunk(chunk)
      expect(audioManager.getAudioDurationMs()).toBe(100)
    })

    test('should calculate duration correctly for different sample rates', () => {
      audioManager.setAudioConfig({ sampleRate: 8000 })
      audioManager.initialize()

      // 8kHz, 16-bit mono = 2 bytes per sample
      // 800 samples = 0.1 seconds = 100ms
      const bytes = 800 * 2 // 1600 bytes
      const chunk = Buffer.alloc(bytes)

      audioManager.addAudioChunk(chunk)
      expect(audioManager.getAudioDurationMs()).toBe(100)
    })

    test('should return zero duration for no audio', () => {
      audioManager.initialize()
      expect(audioManager.getAudioDurationMs()).toBe(0)
    })
  })

  describe('Audio Streaming', () => {
    test('should stream chunks immediately as they arrive', async () => {
      audioManager.initialize()

      const streamPromise = audioManager.streamAudioChunks()
      const iterator = streamPromise[Symbol.asyncIterator]()

      // Add a chunk
      const chunk = Buffer.alloc(100)
      audioManager.addAudioChunk(chunk)

      // Should yield immediately (no minimum duration wait)
      const result = await iterator.next()
      expect(result.done).toBe(false)
      expect(result.value).toHaveProperty('audioData')
      expect(result.value?.audioData).toEqual(chunk)
    })

    test('should continue streaming additional chunks', async () => {
      audioManager.initialize()

      const streamPromise = audioManager.streamAudioChunks()
      const iterator = streamPromise[Symbol.asyncIterator]()

      // Add first chunk
      const chunk1 = Buffer.from('chunk1')
      audioManager.addAudioChunk(chunk1)

      // Get first chunk
      const result1 = await iterator.next()
      expect(result1.done).toBe(false)
      expect(result1.value?.audioData).toEqual(chunk1)

      // Add second chunk
      const chunk2 = Buffer.from('chunk2')
      audioManager.addAudioChunk(chunk2)

      // Should yield the second chunk
      const result2 = await iterator.next()
      expect(result2.done).toBe(false)
      expect(result2.value?.audioData).toEqual(chunk2)
    })

    test('should finish streaming when stopped', async () => {
      audioManager.initialize()

      const chunk = Buffer.alloc(100)
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

    test('should wait for chunks when queue is empty', async () => {
      audioManager.initialize()

      const streamPromise = audioManager.streamAudioChunks()
      const iterator = streamPromise[Symbol.asyncIterator]()

      // Create a promise that races between next() and a timeout
      const timeoutPromise = new Promise(resolve =>
        setTimeout(() => resolve('timeout'), 50),
      )

      // Should wait (timeout) because no chunks have been added
      const result = await Promise.race([iterator.next(), timeoutPromise])
      expect(result).toBe('timeout')
    })

    test('should resume streaming after waiting for chunks', async () => {
      audioManager.initialize()

      const streamPromise = audioManager.streamAudioChunks()
      const iterator = streamPromise[Symbol.asyncIterator]()

      // Start the iteration (will wait for chunks)
      const nextPromise = iterator.next()

      // Add a chunk after a short delay
      setTimeout(() => {
        const chunk = Buffer.from('delayed-chunk')
        audioManager.addAudioChunk(chunk)
      }, 10)

      // Should eventually receive the chunk
      const result = await nextPromise
      expect(result.done).toBe(false)
      expect(result.value?.audioData).toEqual(Buffer.from('delayed-chunk'))
    })
  })

  describe('Edge Cases', () => {
    test('should handle empty chunks', () => {
      audioManager.initialize()

      const emptyChunk = Buffer.alloc(0)
      audioManager.addAudioChunk(emptyChunk)

      expect(audioManager.getAudioDurationMs()).toBe(0)
    })

    test('should handle very small chunks', () => {
      audioManager.initialize()

      const tinyChunk = Buffer.alloc(1) // 1 byte
      audioManager.addAudioChunk(tinyChunk)

      // Should be < 1ms duration
      expect(audioManager.getAudioDurationMs()).toBe(0) // Floors to 0
    })

    test('should reset audio duration on restart', () => {
      audioManager.initialize()
      audioManager.addAudioChunk(Buffer.alloc(3200)) // 100ms
      expect(audioManager.getAudioDurationMs()).toBe(100)

      audioManager.stopStreaming()
      audioManager.initialize()

      expect(audioManager.getAudioDurationMs()).toBe(0)
    })

    test('should accumulate duration across multiple chunks', () => {
      audioManager.initialize()

      // Add 50ms worth (800 samples * 2 bytes)
      audioManager.addAudioChunk(Buffer.alloc(1600))
      expect(audioManager.getAudioDurationMs()).toBe(50)

      // Add another 50ms
      audioManager.addAudioChunk(Buffer.alloc(1600))
      expect(audioManager.getAudioDurationMs()).toBe(100)
    })
  })

  describe('Interaction Audio Buffer', () => {
    test('should maintain complete audio buffer for interaction', () => {
      audioManager.initialize()

      const chunk1 = Buffer.from('audio1')
      const chunk2 = Buffer.from('audio2')
      const chunk3 = Buffer.from('audio3')

      audioManager.addAudioChunk(chunk1)
      audioManager.addAudioChunk(chunk2)
      audioManager.addAudioChunk(chunk3)

      const buffer = audioManager.getInteractionAudioBuffer()
      expect(buffer).toEqual(Buffer.concat([chunk1, chunk2, chunk3]))
    })

    test('should preserve interaction buffer even after streaming stops', () => {
      audioManager.initialize()

      const chunk = Buffer.from('preserved')
      audioManager.addAudioChunk(chunk)

      audioManager.stopStreaming()

      const buffer = audioManager.getInteractionAudioBuffer()
      expect(buffer).toEqual(chunk)
    })

    test('should clear buffer only on explicit clear or restart', () => {
      audioManager.initialize()
      audioManager.addAudioChunk(Buffer.from('test'))

      audioManager.stopStreaming()

      // Buffer should still exist
      expect(audioManager.getInteractionAudioBuffer().length).toBeGreaterThan(0)

      // Clear explicitly
      audioManager.clearInteractionAudio()
      expect(audioManager.getInteractionAudioBuffer().length).toBe(0)
    })
  })
})
