import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock electron modules before importing api
const mockIpcRenderer = {
  send: mock(),
  on: mock(),
  once: mock(),
  invoke: mock(),
  removeListener: mock(),
  removeAllListeners: mock(),
  sendSync: mock(),
}

mock.module('electron', () => ({
  ipcRenderer: mockIpcRenderer,
  IpcRendererEvent: class MockIpcRendererEvent {},
}))

// Import the API after mocking
import api from './api'

describe('Preload API Critical Behavior Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    Object.values(mockIpcRenderer).forEach(mockFn => {
      if (typeof mockFn.mockClear === 'function') {
        mockFn.mockClear()
      }
    })
  })

  describe('Event Listener Cleanup', () => {
    test('should clean up event listeners to prevent memory leaks', () => {
      const callback = mock()
      const cleanup = api.on('test-event', callback)

      // Verify cleanup function works
      cleanup()
      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
        'test-event',
        expect.any(Function),
      )
    })

    test('should unwrap IPC events before calling callbacks', () => {
      const callback = mock()
      api.on('test-event', callback)

      // Simulate IPC event with extra event parameter
      const registeredHandler = mockIpcRenderer.on.mock.calls[0][1]
      const mockEvent = { sender: 'mock' }
      registeredHandler(mockEvent, 'actual-data')

      // Callback should receive only the data, not the event
      expect(callback).toHaveBeenCalledWith('actual-data')
    })
  })

  describe('Error Propagation', () => {
    test('should propagate IPC errors correctly', async () => {
      const error = new Error('IPC communication failed')
      mockIpcRenderer.invoke.mockRejectedValueOnce(error)

      expect(api.invoke('failing-channel')).rejects.toThrow(
        'IPC communication failed',
      )
    })
  })

  describe('Parameter Transformations', () => {
    test('should transform notes.updateContent parameters correctly', async () => {
      await api.notes.updateContent('note-123', 'Updated content')

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'notes:update-content',
        { id: 'note-123', content: 'Updated content' },
      )
    })

    test('should transform dictionary.update parameters correctly', async () => {
      await api.dictionary.update('dict-456', 'example', 'ig-zam-pul')

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('dictionary:update', {
        id: 'dict-456',
        word: 'example',
        pronunciation: 'ig-zam-pul',
      })
    })

    test('should handle null pronunciation in dictionary.update', async () => {
      await api.dictionary.update('dict-789', 'test', null)

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('dictionary:update', {
        id: 'dict-789',
        word: 'test',
        pronunciation: null,
      })
    })

    test('should transform notifyLoginSuccess parameters correctly', async () => {
      const profile = { id: 'user123', email: 'test@example.com' }
      await api.notifyLoginSuccess(profile, 'id-token', 'access-token')

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'notify-login-success',
        { profile, idToken: 'id-token', accessToken: 'access-token' },
      )
    })
  })
})
