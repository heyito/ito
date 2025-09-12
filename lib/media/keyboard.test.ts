import { ItoMode } from '@/app/generated/ito_pb'
import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { EventEmitter } from 'events'
import { fakeTimers } from '../__tests__/helpers/testUtils'
import { DEBOUNCE_TIME } from './keyboard'

const clock = fakeTimers()

// Mock all external dependencies
const mockChildProcess = {
  stdin: {
    write: mock(),
  },
  stdout: new EventEmitter(),
  stderr: new EventEmitter(),
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
  unref: mock(),
  pid: 12345,
  _closeHandler: null as ((code: number, signal: string) => void) | null,
  _errorHandler: null as ((err: Error) => void) | null,
}

const mockSpawn = mock(() => mockChildProcess)

mock.module('child_process', () => ({
  spawn: mockSpawn,
}))

const mockMainStore = {
  get: mock(() => ({
    isShortcutGloballyEnabled: true,
    keyboardShortcuts: [
      {
        id: 'mock-shortcut-1',
        keys: ['command', 'space'],
        mode: ItoMode.TRANSCRIBE,
      },
    ],
  })),
}
mock.module('../main/store', () => ({
  default: mockMainStore,
}))

mock.module('../constants/store-keys', () => ({
  STORE_KEYS: {
    SETTINGS: 'settings',
  },
}))

const mockGetNativeBinaryPath = mock(() => '/path/to/global-key-listener')
mock.module('./native-interface', () => ({
  getNativeBinaryPath: mockGetNativeBinaryPath,
}))

// Create a consistent window mock that will be reused
const mockWindow = {
  webContents: {
    send: mock(),
    isDestroyed: mock(() => false),
  },
}

const mockBrowserWindow = {
  getAllWindows: mock(() => [mockWindow]),
}
mock.module('electron', () => ({
  BrowserWindow: mockBrowserWindow,
}))

const mockAudioRecorderService = {
  stopRecording: mock(),
}
mock.module('./audio', () => ({
  audioRecorderService: mockAudioRecorderService,
}))

const mockVoiceInputService = {
  startSTTService: mock(),
  stopSTTService: mock(),
}
mock.module('../main/voiceInputService', () => ({
  voiceInputService: mockVoiceInputService,
}))

// Helper function to wait for debounce
const waitForDebounce = async () => {
  clock.tick(DEBOUNCE_TIME + 1)
}

// Mock console to avoid spam
beforeEach(async () => {
  console.log = mock()
  console.info = mock()
  console.warn = mock()
  console.error = mock()
})

describe('Keyboard Module', () => {
  beforeEach(async () => {
    // Reset all mocks
    mockSpawn.mockClear()
    mockChildProcess.stdin.write.mockClear()
    mockChildProcess.on.mockClear()
    mockChildProcess.kill.mockClear()
    mockChildProcess.unref.mockClear()
    mockMainStore.get.mockClear()
    mockGetNativeBinaryPath.mockClear()
    mockBrowserWindow.getAllWindows.mockClear()
    mockWindow.webContents.send.mockClear()
    mockWindow.webContents.isDestroyed.mockClear()
    mockAudioRecorderService.stopRecording.mockClear()
    mockVoiceInputService.startSTTService.mockClear()
    mockVoiceInputService.stopSTTService.mockClear()

    // Reset child process to clean state
    mockChildProcess.stdout.removeAllListeners()
    mockChildProcess.stderr.removeAllListeners()
    mockChildProcess._closeHandler = null
    mockChildProcess._errorHandler = null

    // Ensure mockSpawn returns the mock process
    mockSpawn.mockReturnValue(mockChildProcess)

    // Reset module state using the resetForTesting function
    const keyboardModule = await import('./keyboard')
    keyboardModule.resetForTesting()

    // Reset mock window to clean state
    mockWindow.webContents.isDestroyed.mockReturnValue(false)

    // Set default mock return values
    mockMainStore.get.mockReturnValue({
      isShortcutGloballyEnabled: true,
      keyboardShortcuts: [
        {
          id: 'mock-shortcut-1',
          keys: ['command', 'space'],
          mode: ItoMode.TRANSCRIBE,
        },
      ],
    })
    mockGetNativeBinaryPath.mockReturnValue('/path/to/global-key-listener')
  })

  describe('Process Management Business Logic', () => {
    test('should prevent multiple key listener instances', async () => {
      const { startKeyListener } = await import('./keyboard')

      // Start first instance
      startKeyListener()
      mockSpawn.mockClear()

      // Try to start second instance
      startKeyListener()

      expect(mockSpawn).not.toHaveBeenCalled()
      expect(console.warn).toHaveBeenCalledWith('Key listener already running.')
    })

    test('should handle missing binary path gracefully', async () => {
      mockGetNativeBinaryPath.mockReturnValue('')
      const { startKeyListener } = await import('./keyboard')

      startKeyListener()

      expect(mockSpawn).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalledWith(
        'Could not determine key listener binary path.',
      )
    })

    test('should handle spawn errors gracefully', async () => {
      const spawnError = new Error('Failed to spawn process')
      mockSpawn.mockImplementation(() => {
        throw spawnError
      })
      const { startKeyListener } = await import('./keyboard')

      startKeyListener()

      expect(console.error).toHaveBeenCalledWith(
        'Failed to start key listener:',
        spawnError,
      )
    })
  })

  describe('Message Parsing Business Logic', () => {
    test('should handle fragmented JSON from stdout', async () => {
      const { startKeyListener } = await import('./keyboard')

      startKeyListener()

      const keyEvent = {
        type: 'keydown',
        key: 'Space',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 32,
      }

      const jsonString = JSON.stringify(keyEvent) + '\n'
      const fragment1 = jsonString.slice(0, 20)
      const fragment2 = jsonString.slice(20)

      // Send fragmented data
      mockChildProcess.stdout.emit('data', Buffer.from(fragment1))
      mockChildProcess.stdout.emit('data', Buffer.from(fragment2))

      // Should still process the complete event
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'key-event',
        keyEvent,
      )
    })

    test('should handle multiple events in single data chunk', async () => {
      const { startKeyListener } = await import('./keyboard')

      startKeyListener()

      const event1 = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      const event2 = {
        type: 'keyup',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 65,
      }

      const combinedData =
        JSON.stringify(event1) + '\n' + JSON.stringify(event2) + '\n'
      mockChildProcess.stdout.emit('data', Buffer.from(combinedData))

      // Should process both events
      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(2)
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'key-event',
        event1,
      )
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'key-event',
        event2,
      )
    })

    test('should handle malformed JSON gracefully', async () => {
      const { startKeyListener } = await import('./keyboard')

      startKeyListener()

      const malformedJson = '{"type": "keydown", "key":\n'
      mockChildProcess.stdout.emit('data', Buffer.from(malformedJson))

      expect(console.error).toHaveBeenCalledWith(
        'Failed to parse key event:',
        malformedJson.trim(),
        expect.any(Error),
      )
    })
  })

  describe('Window Event Broadcasting Business Logic', () => {
    test('should broadcast events to all non-destroyed windows', async () => {
      const { startKeyListener } = await import('./keyboard')

      // Create multiple windows
      const window1 = {
        webContents: {
          send: mock(),
          isDestroyed: mock(() => false),
        },
      }
      const window2 = {
        webContents: {
          send: mock(),
          isDestroyed: mock(() => false),
        },
      }
      mockBrowserWindow.getAllWindows.mockReturnValue([window1, window2])

      startKeyListener()

      const keyEvent = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyEvent) + '\n'),
      )

      // Should send to both windows
      expect(window1.webContents.send).toHaveBeenCalledWith(
        'key-event',
        keyEvent,
      )
      expect(window2.webContents.send).toHaveBeenCalledWith(
        'key-event',
        keyEvent,
      )
    })

    test('should skip destroyed windows when broadcasting events', async () => {
      const { startKeyListener } = await import('./keyboard')

      // Create windows with one destroyed
      const window1 = {
        webContents: {
          send: mock(),
          isDestroyed: mock(() => false),
        },
      }
      const destroyedWindow = {
        webContents: {
          send: mock(),
          isDestroyed: mock(() => true),
        },
      }
      mockBrowserWindow.getAllWindows.mockReturnValue([
        window1,
        destroyedWindow,
      ])

      startKeyListener()

      const keyEvent = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyEvent) + '\n'),
      )

      // Should only send to non-destroyed window
      expect(window1.webContents.send).toHaveBeenCalledWith(
        'key-event',
        keyEvent,
      )
      expect(destroyedWindow.webContents.send).not.toHaveBeenCalled()
    })
  })

  describe('Shortcut Detection Business Logic', () => {
    test('should activate shortcut when keys match', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'test-shortcut-1',
            keys: ['command', 'space'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Press command key
      const commandDown = {
        type: 'keydown',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 91,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(commandDown) + '\n'),
      )

      // Press space key
      const spaceDown = {
        type: 'keydown',
        key: 'Space',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 32,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(spaceDown) + '\n'),
      )

      // Wait for debounce delay
      await waitForDebounce()

      expect(mockVoiceInputService.startSTTService).toHaveBeenCalled()
      expect(console.info).toHaveBeenCalledWith(
        'lib Shortcut ACTIVATED, starting recording...',
      )
    })

    test('should deactivate shortcut when keys are released', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'test-shortcut',
            keys: ['command', 'space'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Activate shortcut first
      const commandDown = {
        type: 'keydown',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 91,
      }
      const spaceDown = {
        type: 'keydown',
        key: 'Space',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 32,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(commandDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(spaceDown) + '\n'),
      )

      // Wait for debounce delay to activate shortcut
      await waitForDebounce()

      // Release space key
      const spaceUp = {
        type: 'keyup',
        key: 'Space',
        timestamp: '2024-01-01T00:00:00.002Z',
        raw_code: 32,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(spaceUp) + '\n'),
      )

      expect(mockVoiceInputService.stopSTTService).toHaveBeenCalled()
      expect(console.info).toHaveBeenCalledWith(
        'lib Shortcut DEACTIVATED, stopping recording...',
      )
    })

    test('should not activate shortcut when globally disabled', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: false,
        keyboardShortcuts: [
          {
            id: 'test-shortcut',
            keys: ['command', 'space'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      const commandDown = {
        type: 'keydown',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 91,
      }
      const spaceDown = {
        type: 'keydown',
        key: 'Space',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 32,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(commandDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(spaceDown) + '\n'),
      )

      expect(mockVoiceInputService.startSTTService).not.toHaveBeenCalled()
    })

    test('should stop active recording when shortcut is disabled', async () => {
      let isShortcutGloballyEnabled = true
      mockMainStore.get.mockImplementation(() => ({
        isShortcutGloballyEnabled,
        keyboardShortcuts: [
          {
            id: 'disable-test',
            keys: ['command', 'space'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      }))

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Activate shortcut
      const commandDown = {
        type: 'keydown',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 91,
      }
      const spaceDown = {
        type: 'keydown',
        key: 'Space',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 32,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(commandDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(spaceDown) + '\n'),
      )

      // Wait for debounce delay to activate shortcut
      await waitForDebounce()

      // Disable shortcuts
      isShortcutGloballyEnabled = false

      // Send another key event to trigger check
      const otherKey = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.002Z',
        raw_code: 65,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(otherKey) + '\n'),
      )

      expect(mockAudioRecorderService.stopRecording).toHaveBeenCalled()
      expect(console.info).toHaveBeenCalledWith(
        'Shortcut DEACTIVATED, stopping recording...',
      )
    })

    test('should ignore fast fn key events', async () => {
      // Create fresh mock objects for this test to avoid isolation issues
      const freshMockWindow = {
        webContents: {
          send: mock(),
          isDestroyed: mock(() => false),
        },
      }

      const freshMockBrowserWindow = {
        getAllWindows: mock(() => [freshMockWindow]),
      }

      // Temporarily override the electron mock for this test
      const originalGetAllWindows = mockBrowserWindow.getAllWindows
      mockBrowserWindow.getAllWindows = freshMockBrowserWindow.getAllWindows

      try {
        const { startKeyListener } = await import('./keyboard')
        startKeyListener()

        const fastFnEvent = {
          type: 'keydown',
          key: 'Unknown(179)',
          timestamp: '2024-01-01T00:00:00.000Z',
          raw_code: 179,
        }
        mockChildProcess.stdout.emit(
          'data',
          Buffer.from(JSON.stringify(fastFnEvent) + '\n'),
        )

        // Should still forward to windows but not affect shortcut state
        expect(freshMockWindow.webContents.send).toHaveBeenCalledWith(
          'key-event',
          fastFnEvent,
        )
      } finally {
        // Restore original mock
        mockBrowserWindow.getAllWindows = originalGetAllWindows
      }
    })

    test('should handle complex multi-key shortcuts', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'complex-shortcut',
            keys: ['control', 'shift', 'f'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Press all keys in sequence
      const controlDown = {
        type: 'keydown',
        key: 'ControlLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 17,
      }
      const shiftDown = {
        type: 'keydown',
        key: 'ShiftLeft',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 16,
      }
      const fDown = {
        type: 'keydown',
        key: 'KeyF',
        timestamp: '2024-01-01T00:00:00.002Z',
        raw_code: 70,
      }

      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(controlDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(shiftDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(fDown) + '\n'),
      )

      // Wait for debounce delay
      await waitForDebounce()

      expect(mockVoiceInputService.startSTTService).toHaveBeenCalled()
    })

    test('should handle partial shortcut matches correctly', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'partial-test',
            keys: ['command', 'shift', 'a'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Press only command and shift (partial match)
      const commandDown = {
        type: 'keydown',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 91,
      }
      const shiftDown = {
        type: 'keydown',
        key: 'ShiftLeft',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 16,
      }

      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(commandDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(shiftDown) + '\n'),
      )

      // Should not activate shortcut with partial match
      expect(mockVoiceInputService.startSTTService).not.toHaveBeenCalled()
    })

    test('should not activate shortcut when superset of keys is pressed', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'superset-test',
            keys: ['fn'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Press control first, then fn (so fn+control are pressed together but shortcut should not match)
      const controlDown = {
        type: 'keydown',
        key: 'ControlLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 17,
      }
      const fnDown = {
        type: 'keydown',
        key: 'Function',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 179,
      }

      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(controlDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(fnDown) + '\n'),
      )

      // Should not activate shortcut when superset is pressed
      expect(mockVoiceInputService.startSTTService).not.toHaveBeenCalled()
    })

    test('should require exact key match for shortcut activation', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'exact-match-test',
            keys: ['fn'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Press exactly fn (exact match)
      const fnDown = {
        type: 'keydown',
        key: 'Function',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 179,
      }

      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(fnDown) + '\n'),
      )

      // Wait for debounce delay
      await waitForDebounce()

      // Should activate shortcut with exact match
      expect(mockVoiceInputService.startSTTService).toHaveBeenCalledWith(
        ItoMode.TRANSCRIBE,
      )
    })

    test('should not match when extra keys are held with configured shortcut', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'extra-keys-test',
            keys: ['command', 'space'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Press shift first, then command + space (so all three are pressed but shortcut should not match)
      const shiftDown = {
        type: 'keydown',
        key: 'ShiftLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 16,
      }
      const commandDown = {
        type: 'keydown',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 91,
      }
      const spaceDown = {
        type: 'keydown',
        key: 'Space',
        timestamp: '2024-01-01T00:00:00.002Z',
        raw_code: 32,
      }

      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(shiftDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(commandDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(spaceDown) + '\n'),
      )

      // Should not activate shortcut when extra keys are pressed
      expect(mockVoiceInputService.startSTTService).not.toHaveBeenCalled()
    })

    test('should allow repeated shortcut activations with exact matching', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'repeat-test',
            keys: ['command', 'space'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // First activation cycle
      const commandDown1 = {
        type: 'keydown',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 91,
      }
      const spaceDown1 = {
        type: 'keydown',
        key: 'Space',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 32,
      }
      const commandUp1 = {
        type: 'keyup',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.002Z',
        raw_code: 91,
      }
      const spaceUp1 = {
        type: 'keyup',
        key: 'Space',
        timestamp: '2024-01-01T00:00:00.003Z',
        raw_code: 32,
      }

      // Press command + space
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(commandDown1) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(spaceDown1) + '\n'),
      )

      // Wait for debounce delay
      await waitForDebounce()

      expect(mockVoiceInputService.startSTTService).toHaveBeenCalledTimes(1)

      // Release command + space
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(commandUp1) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(spaceUp1) + '\n'),
      )

      expect(mockVoiceInputService.stopSTTService).toHaveBeenCalledTimes(1)

      // Clear mocks for second cycle
      mockVoiceInputService.startSTTService.mockClear()
      mockVoiceInputService.stopSTTService.mockClear()

      // Second activation cycle - should work again
      const commandDown2 = {
        type: 'keydown',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:01.000Z',
        raw_code: 91,
      }
      const spaceDown2 = {
        type: 'keydown',
        key: 'Space',
        timestamp: '2024-01-01T00:00:01.001Z',
        raw_code: 32,
      }

      // Press command + space again
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(commandDown2) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(spaceDown2) + '\n'),
      )

      // Wait for debounce delay
      await waitForDebounce()

      // Should activate shortcut again
      expect(mockVoiceInputService.startSTTService).toHaveBeenCalledTimes(1)
    })
  })

  describe('Key Normalization Business Logic', () => {
    test('should normalize legacy modifier keys to left variants', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'command-test',
            keys: ['command'], // Legacy key, should normalize to command-left
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // MetaLeft should match because 'command' normalizes to 'command-left'
      const metaLeftDown = {
        type: 'keydown',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 91,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(metaLeftDown) + '\n'),
      )

      // Wait for debounce delay
      await waitForDebounce()

      expect(mockVoiceInputService.startSTTService).toHaveBeenCalled()
      mockVoiceInputService.startSTTService.mockClear()

      const metaLeftUp = {
        type: 'keyup',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 91,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(metaLeftUp) + '\n'),
      )

      // MetaRight should NOT trigger since command normalizes to command-left only
      const metaRightDown = {
        type: 'keydown',
        key: 'MetaRight',
        timestamp: '2024-01-01T00:00:00.002Z',
        raw_code: 92,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(metaRightDown) + '\n'),
      )

      // Wait for debounce delay
      await waitForDebounce()

      // Should NOT have been called again
      expect(mockVoiceInputService.startSTTService).not.toHaveBeenCalled()
    })

    test('should normalize letter keys correctly', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'letter-test',
            keys: ['a'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      const keyADown = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown) + '\n'),
      )

      // Wait for debounce delay
      await waitForDebounce()

      expect(mockVoiceInputService.startSTTService).toHaveBeenCalled()
    })

    test('should normalize number keys correctly', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'number-test',
            keys: ['1'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      const digit1Down = {
        type: 'keydown',
        key: 'Digit1',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 49,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(digit1Down) + '\n'),
      )

      // Wait for debounce delay
      await waitForDebounce()

      expect(mockVoiceInputService.startSTTService).toHaveBeenCalled()
    })

    test('should handle unknown keys by lowercasing them', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'unknown-test',
            keys: ['unknownkey'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      const unknownKeyDown = {
        type: 'keydown',
        key: 'UnknownKey',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 999,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(unknownKeyDown) + '\n'),
      )

      // Wait for debounce delay
      await waitForDebounce()

      expect(mockVoiceInputService.startSTTService).toHaveBeenCalled()
    })
  })

  describe('Key Blocking Business Logic', () => {
    test('should block keys when process is running', async () => {
      const { startKeyListener, blockKeys } = await import('./keyboard')

      startKeyListener()
      blockKeys(['KeyA', 'KeyB', 'KeyC'])

      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        JSON.stringify({ command: 'block', keys: ['KeyA', 'KeyB', 'KeyC'] }) +
          '\n',
      )
    })

    test('should warn when trying to block keys without process', async () => {
      const { blockKeys } = await import('./keyboard')

      blockKeys(['KeyA'])

      expect(console.warn).toHaveBeenCalledWith(
        'Key listener not running, cannot block keys.',
      )
      expect(mockChildProcess.stdin.write).not.toHaveBeenCalled()
    })

    test('should unblock individual keys', async () => {
      const { startKeyListener, unblockKey } = await import('./keyboard')

      startKeyListener()
      unblockKey('KeyA')

      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        JSON.stringify({ command: 'unblock', key: 'KeyA' }) + '\n',
      )
    })

    test('should warn when trying to unblock key without process', async () => {
      const { unblockKey } = await import('./keyboard')

      unblockKey('KeyA')

      expect(console.warn).toHaveBeenCalledWith(
        'Key listener not running, cannot unblock key.',
      )
      expect(mockChildProcess.stdin.write).not.toHaveBeenCalled()
    })

    test('should only block keys when complete shortcut is pressed', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'block-test',
            keys: ['control', 'z'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Should not block keys initially
      expect(mockChildProcess.stdin.write).not.toHaveBeenCalled()

      // Press only control (partial shortcut) - should not block
      const controlDown = {
        type: 'keydown',
        key: 'ControlLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 17,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(controlDown) + '\n'),
      )

      // Should unblock keys since complete shortcut is not pressed
      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        JSON.stringify({ command: 'block', keys: [] }) + '\n',
      )

      // Press z key to complete shortcut
      const zDown = {
        type: 'keydown',
        key: 'KeyZ',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 90,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(zDown) + '\n'),
      )

      // Now should block keys since complete shortcut is pressed
      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('"command":"block"'),
      )
      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('ControlLeft'),
      )
      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('KeyZ'),
      )
    })

    test('should not block keys when shortcut is disabled', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: false,
        keyboardShortcuts: [
          {
            id: 'disabled-block-test',
            keys: ['control', 'z'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Should not block any keys if shortcut is disabled
      expect(mockChildProcess.stdin.write).not.toHaveBeenCalled()
    })
  })

  describe('Memory Management Business Logic', () => {
    test('should clear pressed keys state on stop', async () => {
      const { startKeyListener, stopKeyListener } = await import('./keyboard')

      startKeyListener()

      // Simulate some key presses
      const keyADown = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      const keyBDown = {
        type: 'keydown',
        key: 'KeyB',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 66,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyBDown) + '\n'),
      )

      stopKeyListener()

      // After restart, pressed keys should be cleared
      startKeyListener()

      // The shortcut that required both A and B should not be active
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'memory-test',
            keys: ['a', 'b'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      // Only press A again - should not trigger shortcut since B was cleared
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown) + '\n'),
      )

      expect(mockVoiceInputService.startSTTService).not.toHaveBeenCalled()
    })
  })

  describe('Stuck Key Detection', () => {
    test('should remove keys stuck for more than 5 seconds', async () => {
      const { startKeyListener } = await import('./keyboard')

      startKeyListener()

      // Press a key
      const keyADown = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown) + '\n'),
      )

      // Advance time by more than 5 seconds (5000ms + check interval 1000ms)
      clock.tick(6000)

      // Should warn about removing stuck key
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Removing stuck key: a'),
      )
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('(held for 6s)'),
      )
    })

    test('should not remove stuck keys that are part of active shortcuts', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'stuck-key-protection-test',
            keys: ['command', 'space'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Activate shortcut
      const commandDown = {
        type: 'keydown',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 91,
      }
      const spaceDown = {
        type: 'keydown',
        key: 'Space',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 32,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(commandDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(spaceDown) + '\n'),
      )

      // Wait for debounce to activate shortcut
      await waitForDebounce()

      // Advance time by more than 5 seconds
      clock.tick(6000)

      // Should not warn about removing stuck keys since they're part of active shortcut
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Removing stuck key'),
      )
    })

    test('should remove stuck keys that are not part of active shortcuts', async () => {
      mockMainStore.get.mockReturnValue({
        isShortcutGloballyEnabled: true,
        keyboardShortcuts: [
          {
            id: 'partial-stuck-test',
            keys: ['command', 'space'],
            mode: ItoMode.TRANSCRIBE,
          },
        ],
      })

      const { startKeyListener } = await import('./keyboard')
      startKeyListener()

      // Activate shortcut
      const commandDown = {
        type: 'keydown',
        key: 'MetaLeft',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 91,
      }
      const spaceDown = {
        type: 'keydown',
        key: 'Space',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 32,
      }
      // Press an extra key that's not part of the shortcut
      const keyADown = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.002Z',
        raw_code: 65,
      }

      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(commandDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(spaceDown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown) + '\n'),
      )

      // Wait for debounce to activate shortcut
      await waitForDebounce()

      // Advance time by more than 5 seconds
      clock.tick(6000)

      // Should warn about removing the stuck key that's not part of the active shortcut
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Removing stuck key: a'),
      )
    })

    test('should not check for stuck keys when no shortcut is active', async () => {
      const { startKeyListener } = await import('./keyboard')

      startKeyListener()

      // Press some keys without activating any shortcuts
      const keyADown = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      const keyBDown = {
        type: 'keydown',
        key: 'KeyB',
        timestamp: '2024-01-01T00:00:00.001Z',
        raw_code: 66,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyBDown) + '\n'),
      )

      // Advance time by more than 5 seconds
      clock.tick(6000)

      // Should still remove stuck keys even when no shortcut is active
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Removing stuck key: a'),
      )
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Removing stuck key: b'),
      )
    })

    test('should clear stuck key tracking on key release', async () => {
      const { startKeyListener } = await import('./keyboard')

      startKeyListener()

      // Press and release a key quickly
      const keyADown = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      const keyAUp = {
        type: 'keyup',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.100Z',
        raw_code: 65,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown) + '\n'),
      )
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyAUp) + '\n'),
      )

      // Advance time by more than 5 seconds
      clock.tick(6000)

      // Should not warn about stuck key since it was released
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Removing stuck key: a'),
      )
    })

    test('should not track duplicate keydown events for same key', async () => {
      const { startKeyListener } = await import('./keyboard')

      startKeyListener()

      // Press same key multiple times (simulating key repeat)
      const keyADown1 = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown1) + '\n'),
      )

      // Advance time slightly
      clock.tick(1000)

      const keyADown2 = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:01.000Z',
        raw_code: 65,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown2) + '\n'),
      )

      // Advance time by more than 5 seconds from first press
      clock.tick(5000)

      // Should warn about stuck key based on first timestamp, not second
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Removing stuck key: a'),
      )
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('(held for 6s)'),
      )
    })

    test('should clean up stuck key checker on stop', async () => {
      const { startKeyListener, stopKeyListener } = await import('./keyboard')

      startKeyListener()

      // Press a key
      const keyADown = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown) + '\n'),
      )

      // Stop the key listener
      stopKeyListener()

      // Advance time by more than 5 seconds
      clock.tick(6000)

      // Should not warn about stuck keys since listener was stopped
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Removing stuck key'),
      )
    })

    test('should clean up stuck key data in resetForTesting', async () => {
      const { startKeyListener, resetForTesting } = await import('./keyboard')

      startKeyListener()

      // Press a key
      const keyADown = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown) + '\n'),
      )

      // Reset for testing
      resetForTesting()

      // Start again
      startKeyListener()

      // Advance time by more than 5 seconds
      clock.tick(6000)

      // Should not warn about stuck keys since data was reset
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Removing stuck key'),
      )
    })

    test('should handle check interval timing correctly', async () => {
      const { startKeyListener } = await import('./keyboard')

      startKeyListener()

      // Press a key
      const keyADown = {
        type: 'keydown',
        key: 'KeyA',
        timestamp: '2024-01-01T00:00:00.000Z',
        raw_code: 65,
      }
      mockChildProcess.stdout.emit(
        'data',
        Buffer.from(JSON.stringify(keyADown) + '\n'),
      )

      // Advance time by exactly 5 seconds (should not trigger removal yet)
      clock.tick(5000)
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Removing stuck key'),
      )

      // Advance time by the check interval (should trigger removal)
      clock.tick(1000)
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Removing stuck key: a'),
      )
    })
  })
})
