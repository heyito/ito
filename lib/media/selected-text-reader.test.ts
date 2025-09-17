import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test'
import { EventEmitter } from 'events'

// Mock all external dependencies
const mockStdout = new EventEmitter()
const mockStderr = new EventEmitter()
mockStdout.on = mock(mockStdout.on.bind(mockStdout))
mockStderr.on = mock(mockStderr.on.bind(mockStderr))

const mockChildProcess = {
  stdin: {
    write: mock(),
  },
  stdout: mockStdout,
  stderr: mockStderr,
  on: mock((event: string, handler: any) => {
    // Store handlers so tests can verify they were registered
    if (event === 'close') {
      mockChildProcess._closeHandler = handler as (
        code: number,
        signal: string,
      ) => void
    } else if (event === 'error') {
      mockChildProcess._errorHandler = handler as (err: Error) => void
    }
  }),
  kill: mock(),
  pid: 12345,
  _closeHandler: null as ((code: number, signal: string) => void) | null,
  _errorHandler: null as ((err: Error) => void) | null,
}

const mockSpawn = mock(() => mockChildProcess)

mock.module('child_process', () => ({
  spawn: mockSpawn,
}))

const mockLog = {
  info: mock(),
  warn: mock(),
  error: mock(),
  debug: mock(),
}

mock.module('electron-log', () => ({
  default: mockLog,
}))

const selectedTextReaderPath = '/mock/path/to/selected-text-reader'

const mockGetNativeBinaryPath = mock(
  (): string | null => selectedTextReaderPath,
)

mock.module('./native-interface', () => ({
  getNativeBinaryPath: mockGetNativeBinaryPath,
}))

// Import after mocking
import {
  selectedTextReaderService,
  getSelectedText,
  getSelectedTextString,
  hasSelectedText,
} from './selected-text-reader'

describe('SelectedTextReaderService', () => {
  beforeEach(() => {
    // Reset all mocks
    mockSpawn.mockClear()
    mockChildProcess.stdin.write.mockClear()
    mockChildProcess.on.mockClear()
    mockChildProcess.kill.mockClear()
    mockGetNativeBinaryPath.mockClear()
    mockLog.info.mockClear()
    mockLog.warn.mockClear()
    mockLog.error.mockClear()
    mockLog.debug.mockClear()

    // Reset mock return value to the expected path
    mockGetNativeBinaryPath.mockReturnValue(selectedTextReaderPath)

    // Clear event emitter listeners to prevent memory leaks
    mockStdout.removeAllListeners()
    mockStderr.removeAllListeners()

    // Reset stdin.write mock to default
    mockChildProcess.stdin.write.mockReset()
  })

  afterEach(() => {
    // Clean up service state
    selectedTextReaderService.terminate()
  })

  test('should initialize service and spawn process', () => {
    selectedTextReaderService.initialize()

    expect(mockSpawn).toHaveBeenCalledWith(selectedTextReaderPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    expect(mockChildProcess.stdout.on).toHaveBeenCalledWith(
      'data',
      expect.any(Function),
    )
    expect(mockChildProcess.on).toHaveBeenCalledWith(
      'close',
      expect.any(Function),
    )
    expect(mockChildProcess.on).toHaveBeenCalledWith(
      'error',
      expect.any(Function),
    )
  })

  test('should not initialize if already running', () => {
    selectedTextReaderService.initialize()
    mockSpawn.mockClear()

    selectedTextReaderService.initialize()

    expect(mockSpawn).not.toHaveBeenCalled()
    expect(mockLog.warn).toHaveBeenCalledWith(
      '[SelectedTextService] Selected text reader already running.',
    )
  })

  test('should handle missing binary path', () => {
    mockGetNativeBinaryPath.mockReturnValue(null)

    // Add error event listener to handle the emitted error
    selectedTextReaderService.on('error', () => {
      // Expected error, do nothing
    })

    selectedTextReaderService.initialize()

    expect(mockSpawn).not.toHaveBeenCalled()
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot determine selected-text-reader binary path',
      ),
    )
  })

  test('should terminate process', () => {
    selectedTextReaderService.initialize()
    selectedTextReaderService.terminate()

    expect(mockChildProcess.kill).toHaveBeenCalled()
  })

  test('should send command to get selected text', async () => {
    selectedTextReaderService.initialize()

    let capturedRequestId: string | null = null

    // Capture the request ID from stdin write
    mockChildProcess.stdin.write.mockImplementation((data: string) => {
      try {
        const command = JSON.parse(data.trim())
        capturedRequestId = command.requestId

        // Simulate response with the captured request ID
        setTimeout(() => {
          const mockResponse = {
            requestId: capturedRequestId,
            success: true,
            text: 'selected text',
            error: null,
            length: 13,
          }
          mockChildProcess.stdout.emit(
            'data',
            Buffer.from(JSON.stringify(mockResponse) + '\n'),
          )
        }, 5)
      } catch {
        // Ignore parsing errors for this test
      }
      return true
    })

    const promise = selectedTextReaderService.getSelectedText({
      format: 'json',
      maxLength: 1000,
    })

    const result = await promise
    expect(result.success).toBe(true)
    expect(result.text).toBe('selected text')
    expect(capturedRequestId).toBeTruthy()
  })

  test('should handle process not running', async () => {
    const promise = selectedTextReaderService.getSelectedText({
      format: 'json',
      maxLength: 1000,
    })

    expect(promise).rejects.toThrow('Selected text reader process not running')
  })

  test('should handle process close with pending requests', () => {
    selectedTextReaderService.initialize()

    const promise = selectedTextReaderService.getSelectedText({
      format: 'json',
      maxLength: 1000,
    })

    // Simulate process close
    if (mockChildProcess._closeHandler) {
      mockChildProcess._closeHandler(1, 'SIGTERM')
    }

    expect(promise).rejects.toThrow('Process exited with code 1')
  })
})

describe('Selected Text Reader Functions', () => {
  beforeEach(() => {
    mockSpawn.mockClear()
    mockChildProcess.stdin.write.mockClear()
    mockLog.debug.mockClear()
    mockLog.error.mockClear()

    // Reset mock return value to the expected path
    mockGetNativeBinaryPath.mockReturnValue(selectedTextReaderPath)

    // Clear event emitter listeners
    mockStdout.removeAllListeners()
    mockStderr.removeAllListeners()

    // Reset stdin.write mock
    mockChildProcess.stdin.write.mockReset()
  })

  afterEach(() => {
    selectedTextReaderService.terminate()
  })

  test('getSelectedText should use service', async () => {
    selectedTextReaderService.initialize()

    // Mock stdin write to respond with captured request ID
    mockChildProcess.stdin.write.mockImplementation((data: string) => {
      try {
        const command = JSON.parse(data.trim())
        setTimeout(() => {
          const mockResponse = {
            requestId: command.requestId,
            success: true,
            text: 'test text',
            error: null,
            length: 9,
          }
          mockChildProcess.stdout.emit(
            'data',
            Buffer.from(JSON.stringify(mockResponse) + '\n'),
          )
        }, 5)
      } catch {
        // Ignore parsing errors
      }
      return true
    })

    const result = await getSelectedText({ format: 'json', maxLength: 1000 })

    expect(result.success).toBe(true)
    expect(result.text).toBe('test text')
  })

  test('getSelectedTextString should return text or null', async () => {
    selectedTextReaderService.initialize()

    mockChildProcess.stdin.write.mockImplementation((data: string) => {
      try {
        const command = JSON.parse(data.trim())
        setTimeout(() => {
          const mockResponse = {
            requestId: command.requestId,
            success: true,
            text: 'hello world',
            error: null,
            length: 11,
          }
          mockChildProcess.stdout.emit(
            'data',
            Buffer.from(JSON.stringify(mockResponse) + '\n'),
          )
        }, 5)
      } catch {
        // Ignore parsing errors
      }
      return true
    })

    const result = await getSelectedTextString(1000)

    expect(result).toBe('hello world')
  })

  test('getSelectedTextString should return null on failure', async () => {
    selectedTextReaderService.initialize()

    mockChildProcess.stdin.write.mockImplementation((data: string) => {
      try {
        const command = JSON.parse(data.trim())
        setTimeout(() => {
          const mockResponse = {
            requestId: command.requestId,
            success: false,
            text: null,
            error: 'No text selected',
            length: 0,
          }
          mockChildProcess.stdout.emit(
            'data',
            Buffer.from(JSON.stringify(mockResponse) + '\n'),
          )
        }, 5)
      } catch {
        // Ignore parsing errors
      }
      return true
    })

    const result = await getSelectedTextString(1000)

    expect(result).toBeNull()
  })

  test('hasSelectedText should return boolean', async () => {
    selectedTextReaderService.initialize()

    mockChildProcess.stdin.write.mockImplementation((data: string) => {
      try {
        const command = JSON.parse(data.trim())
        setTimeout(() => {
          const mockResponse = {
            requestId: command.requestId,
            success: true,
            text: 'x',
            error: null,
            length: 1,
          }
          mockChildProcess.stdout.emit(
            'data',
            Buffer.from(JSON.stringify(mockResponse) + '\n'),
          )
        }, 5)
      } catch {
        // Ignore parsing errors
      }
      return true
    })

    const result = await hasSelectedText()

    expect(typeof result).toBe('boolean')
    expect(result).toBe(true)
  })

  test('hasSelectedText should return false when no text', async () => {
    selectedTextReaderService.initialize()

    mockChildProcess.stdin.write.mockImplementation((data: string) => {
      try {
        const command = JSON.parse(data.trim())
        setTimeout(() => {
          const mockResponse = {
            requestId: command.requestId,
            success: true,
            text: null,
            error: null,
            length: 0,
          }
          mockChildProcess.stdout.emit(
            'data',
            Buffer.from(JSON.stringify(mockResponse) + '\n'),
          )
        }, 5)
      } catch {
        // Ignore parsing errors
      }
      return true
    })

    const result = await hasSelectedText()

    expect(result).toBe(false)
  })

  test('functions should handle service errors gracefully', async () => {
    // Don't initialize service to test error handling

    const textResult = await getSelectedTextString(1000)
    expect(textResult).toBeNull()
    expect(mockLog.error).toHaveBeenCalledWith(
      'Error getting selected text:',
      expect.any(Error),
    )

    const hasResult = await hasSelectedText()
    expect(hasResult).toBe(false)
  })
})
