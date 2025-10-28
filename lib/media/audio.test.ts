import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { EventEmitter } from 'events'

// Mock all external dependencies
const mockSpawn = mock(() => mockChildProcess)
const mockChildProcess = {
  stdin: {
    write: mock(),
  },
  stdout: new EventEmitter(),
  stderr: new EventEmitter(),
  on: mock(
    (
      event: string,
      handler: ((code: number) => void) | ((err: Error) => void),
    ) => {
      // Capture the event handlers so we can trigger them in tests
      if (event === 'close') {
        mockChildProcess._closeHandler = handler as (code: number) => void
      } else if (event === 'error') {
        mockChildProcess._errorHandler = handler as (err: Error) => void
      }
    },
  ),
  kill: mock(),
  pid: 12345,
  _closeHandler: null as ((code: number) => void) | null,
  _errorHandler: null as ((err: Error) => void) | null,
}

mock.module('child_process', () => ({
  spawn: mockSpawn,
}))

mock.module('path', () => ({
  join: mock((...paths: string[]) => paths.join('/')),
}))

mock.module('electron', () => ({
  app: {
    isPackaged: false,
    getPath: (type: string) =>
      type === 'userData' ? '/tmp/test-ito-app' : '/tmp',
  },
}))

mock.module('os', () => ({
  default: {
    platform: mock(() => 'darwin'),
    arch: mock(() => 'arm64'),
  },
}))

// Helper function to wait for async operations
const waitForProcessing = () => new Promise(resolve => setTimeout(resolve, 10))

// Import after mocking
import { audioRecorderService } from './audio'

describe('AudioRecorderService', () => {
  beforeEach(() => {
    // Reset all mocks
    mockSpawn.mockClear()
    mockSpawn.mockReturnValue(mockChildProcess)
    mockChildProcess.stdin.write.mockClear()
    mockChildProcess.on.mockClear()
    mockChildProcess.kill.mockClear()

    // Reset child process to clean state
    mockChildProcess.stdout.removeAllListeners()
    mockChildProcess.stderr.removeAllListeners()
    mockChildProcess._closeHandler = null
    mockChildProcess._errorHandler = null

    // Clear service event listeners
    // reset via terminate which clears listeners in implementation
    // Attempt to terminate if available; some tests may have mocked the service
    if (typeof (audioRecorderService as any).terminate === 'function') {
      ;(audioRecorderService as any).terminate()
    }
  })

  describe('Initialization Business Logic', () => {
    test('should prevent multiple initialization', () => {
      // First initialization
      audioRecorderService.initialize()
      mockSpawn.mockClear()

      // Second initialization should be ignored
      audioRecorderService.initialize()

      expect(mockSpawn).not.toHaveBeenCalled()
    })

    test('should handle spawn errors gracefully', async () => {
      const spawnError = new Error('Spawn failed')

      let errorEmitted = false
      audioRecorderService.on('error', () => {
        errorEmitted = true
      })

      // Set up spawn to throw an error
      mockSpawn.mockImplementationOnce(() => {
        throw spawnError
      })

      audioRecorderService.initialize()

      // Wait for error handling to complete
      await waitForProcessing()

      expect(errorEmitted).toBe(true)

      // Reset the mock back to normal behavior for other tests
      mockSpawn.mockImplementation(() => mockChildProcess)
    })
  })

  describe('Process Lifecycle Business Logic', () => {
    beforeEach(() => {
      audioRecorderService.initialize()
    })

    test('should handle process close event correctly', async () => {
      let stoppedEmitted = false
      audioRecorderService.on('stopped', () => {
        stoppedEmitted = true
      })

      // Simulate process close using captured handler
      expect(mockChildProcess._closeHandler).toBeDefined()
      mockChildProcess._closeHandler!(0)

      expect(stoppedEmitted).toBe(true)
    })

    test('should handle process error event', async () => {
      const processError = new Error('Process error')
      let errorEmitted = false
      audioRecorderService.on('error', () => {
        errorEmitted = true
      })

      // Simulate process error using captured handler
      expect(mockChildProcess._errorHandler).toBeDefined()
      mockChildProcess._errorHandler!(processError)

      expect(errorEmitted).toBe(true)
    })
  })

  describe('Recording Commands Business Logic', () => {
    beforeEach(() => {
      audioRecorderService.initialize()
    })

    test('should send start recording command with device name', () => {
      const deviceName = 'Built-in Microphone'

      audioRecorderService.startRecording(deviceName)

      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        JSON.stringify({ command: 'start', device_name: deviceName }) + '\n',
      )
    })

    test('should send stop recording command', () => {
      audioRecorderService.stopRecording()

      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        JSON.stringify({ command: 'stop' }) + '\n',
      )
    })
  })

  describe('Device Management Business Logic', () => {
    beforeEach(() => {
      audioRecorderService.initialize()
    })

    test('should request device list successfully', async () => {
      const mockDevices = ['Device 1', 'Device 2', 'Device 3']

      // Setup device list promise
      const deviceListPromise = audioRecorderService.getDeviceList()

      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        JSON.stringify({ command: 'list-devices' }) + '\n',
      )

      // Simulate device list response
      const deviceListMessage = Buffer.concat([
        Buffer.from([1]), // MSG_TYPE_JSON
        Buffer.from([0, 0, 0, 0]), // Length placeholder
        Buffer.from(
          JSON.stringify({ type: 'device-list', devices: mockDevices }),
        ),
      ])
      // Update length field
      deviceListMessage.writeUInt32LE(deviceListMessage.length - 5, 1)

      // Emit data through stdout
      mockChildProcess.stdout.emit('data', deviceListMessage)

      const devices = await deviceListPromise
      expect(devices).toEqual(mockDevices)
    })

    test('should reject device list when process not running', async () => {
      audioRecorderService.terminate()

      await expect(audioRecorderService.getDeviceList()).rejects.toThrow(
        'Audio recorder process not running.',
      )
    })

    test('should handle empty device list', async () => {
      const deviceListPromise = audioRecorderService.getDeviceList()

      // Simulate empty device list response
      const deviceListMessage = Buffer.concat([
        Buffer.from([1]), // MSG_TYPE_JSON
        Buffer.from([0, 0, 0, 0]), // Length placeholder
        Buffer.from(JSON.stringify({ type: 'device-list', devices: [] })),
      ])
      deviceListMessage.writeUInt32LE(deviceListMessage.length - 5, 1)

      mockChildProcess.stdout.emit('data', deviceListMessage)

      const devices = await deviceListPromise
      expect(devices).toEqual([])
    })

    test('should handle malformed JSON in device list response', async () => {
      const deviceListPromise = audioRecorderService.getDeviceList()

      // Simulate malformed JSON response
      const malformedMessage = Buffer.concat([
        Buffer.from([1]), // MSG_TYPE_JSON
        Buffer.from([0, 0, 0, 0]), // Length placeholder
        Buffer.from('invalid json {'),
      ])
      malformedMessage.writeUInt32LE(malformedMessage.length - 5, 1)

      // Emit data
      mockChildProcess.stdout.emit('data', malformedMessage)

      // The promise should be rejected due to JSON parse error
      try {
        await deviceListPromise
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Failed to parse JSON response')
      }

      // Wait for processing
      await waitForProcessing()
    })
  })

  describe('Audio Data Processing Business Logic', () => {
    beforeEach(() => {
      audioRecorderService.initialize()
    })

    test('should process audio chunks and calculate volume', async () => {
      let volumeUpdate: number | null = null
      let audioChunk: Buffer | null = null

      audioRecorderService.on('volume-update', (volume: number) => {
        volumeUpdate = volume
      })
      audioRecorderService.on('audio-chunk', (chunk: Buffer) => {
        audioChunk = chunk
      })

      // Create mock audio data (16-bit PCM)
      const audioData = Buffer.alloc(1024)
      // Fill with some sample data
      for (let i = 0; i < audioData.length; i += 2) {
        audioData.writeInt16LE(Math.floor(Math.random() * 32767), i)
      }

      // Create audio message
      const audioMessage = Buffer.concat([
        Buffer.from([2]), // MSG_TYPE_AUDIO
        Buffer.from([0, 0, 0, 0]), // Length placeholder
        audioData,
      ])
      audioMessage.writeUInt32LE(audioMessage.length - 5, 1)

      mockChildProcess.stdout.emit('data', audioMessage)

      // Wait for event processing
      await waitForProcessing()

      expect(volumeUpdate).toBeTypeOf('number')
      expect(volumeUpdate!).toBeGreaterThanOrEqual(0)
      expect(volumeUpdate!).toBeLessThanOrEqual(1)
      expect(audioChunk!).toEqual(audioData)
    })

    test('should handle fragmented messages correctly', async () => {
      let messageReceived = false
      audioRecorderService.on('audio-chunk', () => {
        messageReceived = true
      })

      // Create a message and split it
      const audioData = Buffer.alloc(100)
      const fullMessage = Buffer.concat([
        Buffer.from([2]), // MSG_TYPE_AUDIO
        Buffer.from([100, 0, 0, 0]), // Length: 100
        audioData,
      ])

      // Send in two fragments
      const fragment1 = fullMessage.slice(0, 50)
      const fragment2 = fullMessage.slice(50)

      mockChildProcess.stdout.emit('data', fragment1)
      await waitForProcessing()
      expect(messageReceived).toBe(false) // Should not be processed yet

      mockChildProcess.stdout.emit('data', fragment2)
      await waitForProcessing()
      expect(messageReceived).toBe(true) // Now should be processed
    })

    test('should handle multiple messages in single data chunk', async () => {
      let messageCount = 0
      audioRecorderService.on('audio-chunk', () => {
        messageCount++
      })

      // Create two small audio messages
      const audioData1 = Buffer.alloc(10)
      const audioData2 = Buffer.alloc(15)

      const message1 = Buffer.concat([
        Buffer.from([2]), // MSG_TYPE_AUDIO
        Buffer.from([10, 0, 0, 0]), // Length: 10
        audioData1,
      ])

      const message2 = Buffer.concat([
        Buffer.from([2]), // MSG_TYPE_AUDIO
        Buffer.from([15, 0, 0, 0]), // Length: 15
        audioData2,
      ])

      // Send both messages in one chunk
      const combinedData = Buffer.concat([message1, message2])
      mockChildProcess.stdout.emit('data', combinedData)

      // Wait for processing
      await waitForProcessing()

      expect(messageCount).toBe(2)
    })

    test('should handle invalid message types gracefully', async () => {
      const invalidMessage = Buffer.concat([
        Buffer.from([99]), // Invalid message type
        Buffer.from([5, 0, 0, 0]), // Length: 5
        Buffer.from('hello'),
      ])

      // Should not throw
      expect(() => {
        mockChildProcess.stdout.emit('data', invalidMessage)
      }).not.toThrow()

      // Wait for processing
      await waitForProcessing()
    })
  })

  describe('Volume Calculation Business Logic', () => {
    beforeEach(() => {
      audioRecorderService.initialize()
    })

    test('should calculate volume correctly for various inputs', async () => {
      // Test silent audio (all zeros)
      const silentAudio = Buffer.alloc(1024, 0)
      let volume: number | null = null
      audioRecorderService.on('volume-update', (v: number) => {
        volume = v
      })

      const silentMessage = Buffer.concat([
        Buffer.from([2]), // MSG_TYPE_AUDIO
        Buffer.from([0, 0, 0, 0]), // Length placeholder
        silentAudio,
      ])
      silentMessage.writeUInt32LE(silentMessage.length - 5, 1)

      mockChildProcess.stdout.emit('data', silentMessage)
      await waitForProcessing()

      expect(volume!).toBe(0)

      // Test maximum volume audio
      const maxAudio = Buffer.alloc(1024)
      for (let i = 0; i < maxAudio.length; i += 2) {
        maxAudio.writeInt16LE(32767, i) // Max 16-bit value
      }

      const maxMessage = Buffer.concat([
        Buffer.from([2]), // MSG_TYPE_AUDIO
        Buffer.from([0, 0, 0, 0]), // Length placeholder
        maxAudio,
      ])
      maxMessage.writeUInt32LE(maxMessage.length - 5, 1)

      mockChildProcess.stdout.emit('data', maxMessage)
      await waitForProcessing()

      expect(volume!).toBe(1.0)
    })

    test('should handle empty audio buffer', async () => {
      let volume: number | null = null
      audioRecorderService.on('volume-update', (v: number) => {
        volume = v
      })

      const emptyMessage = Buffer.concat([
        Buffer.from([2]), // MSG_TYPE_AUDIO
        Buffer.from([0, 0, 0, 0]), // Length: 0
        Buffer.alloc(0),
      ])

      mockChildProcess.stdout.emit('data', emptyMessage)
      await waitForProcessing()

      expect(volume!).toBe(0)
    })

    test('should handle very small audio buffers', async () => {
      let volume: number | null = null
      audioRecorderService.on('volume-update', (v: number) => {
        volume = v
      })

      // Test 1-byte buffer (too small for 16-bit sample)
      const tinyMessage = Buffer.concat([
        Buffer.from([2]), // MSG_TYPE_AUDIO
        Buffer.from([1, 0, 0, 0]), // Length: 1
        Buffer.from([0]), // Single byte
      ])

      mockChildProcess.stdout.emit('data', tinyMessage)
      await waitForProcessing()

      expect(volume!).toBe(0)
    })

    test('should handle odd-length audio buffers', async () => {
      let volume: number | null = null
      audioRecorderService.on('volume-update', (v: number) => {
        volume = v
      })

      // Test 3-byte buffer (odd length, should handle gracefully)
      const oddLengthAudio = Buffer.from([0, 0, 0]) // 3 bytes
      const oddMessage = Buffer.concat([
        Buffer.from([2]), // MSG_TYPE_AUDIO
        Buffer.from([3, 0, 0, 0]), // Length: 3
        oddLengthAudio,
      ])

      mockChildProcess.stdout.emit('data', oddMessage)
      await waitForProcessing()

      // Should calculate volume from the first 2 bytes (first sample)
      expect(volume!).toBe(0)
    })
  })
})
