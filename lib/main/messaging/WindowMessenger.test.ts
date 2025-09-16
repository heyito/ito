import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock electron
const mockWebContents = {
  send: mock(),
  isDestroyed: mock(() => false),
}

const mockBrowserWindow = {
  webContents: mockWebContents,
  isDestroyed: mock(() => false),
}

mock.module('electron', () => ({
  BrowserWindow: class MockBrowserWindow {
    webContents = mockWebContents
    isDestroyed = mockBrowserWindow.isDestroyed
  },
}))

import { WindowMessenger } from './WindowMessenger'

describe('WindowMessenger', () => {
  let windowMessenger: WindowMessenger

  beforeEach(() => {
    windowMessenger = new WindowMessenger()
    mockWebContents.send.mockClear()
    mockWebContents.isDestroyed.mockClear()
    mockBrowserWindow.isDestroyed.mockClear()

    // Reset default mock behavior
    mockWebContents.isDestroyed.mockReturnValue(false)
    mockBrowserWindow.isDestroyed.mockReturnValue(false)
  })

  describe('Window Management', () => {
    test('should start with no main window', () => {
      expect(windowMessenger['mainWindow']).toBeNull()
    })

    test('should set main window', () => {
      const mockWindow = mockBrowserWindow as any
      windowMessenger.setMainWindow(mockWindow)
      expect(windowMessenger['mainWindow']).toBe(mockWindow)
    })

    test('should allow setting window to null', () => {
      const mockWindow = mockBrowserWindow as any
      windowMessenger.setMainWindow(mockWindow)
      windowMessenger.setMainWindow(null)
      expect(windowMessenger['mainWindow']).toBeNull()
    })
  })

  describe('Message Sending - canSendMessage checks', () => {
    test('should not send when no main window is set', () => {
      const response = { transcript: 'test' }
      windowMessenger.sendTranscriptionResult(response)

      expect(mockWebContents.send).not.toHaveBeenCalled()
    })

    test('should not send when main window is destroyed', () => {
      const mockWindow = mockBrowserWindow as any
      mockBrowserWindow.isDestroyed.mockReturnValue(true)

      windowMessenger.setMainWindow(mockWindow)
      windowMessenger.sendTranscriptionResult({ transcript: 'test' })

      expect(mockWebContents.send).not.toHaveBeenCalled()
    })

    test('should not send when webContents is destroyed', () => {
      const mockWindow = mockBrowserWindow as any
      mockWebContents.isDestroyed.mockReturnValue(true)

      windowMessenger.setMainWindow(mockWindow)
      windowMessenger.sendTranscriptionResult({ transcript: 'test' })

      expect(mockWebContents.send).not.toHaveBeenCalled()
    })

    test('should not send when webContents is null', () => {
      const mockWindow = {
        ...mockBrowserWindow,
        webContents: null
      } as any

      windowMessenger.setMainWindow(mockWindow)
      windowMessenger.sendTranscriptionResult({ transcript: 'test' })

      expect(mockWebContents.send).not.toHaveBeenCalled()
    })
  })

  describe('Transcription Result Messaging', () => {
    beforeEach(() => {
      const mockWindow = mockBrowserWindow as any
      windowMessenger.setMainWindow(mockWindow)
    })

    test('should send transcription result when window is valid', () => {
      const response = { transcript: 'Hello world', confidence: 0.95 }

      windowMessenger.sendTranscriptionResult(response)

      expect(mockWebContents.send).toHaveBeenCalledWith('transcription-result', response)
    })

    test('should send different transcription results', () => {
      const response1 = { transcript: 'First message' }
      const response2 = { transcript: 'Second message', metadata: { duration: 1000 } }

      windowMessenger.sendTranscriptionResult(response1)
      windowMessenger.sendTranscriptionResult(response2)

      expect(mockWebContents.send).toHaveBeenCalledTimes(2)
      expect(mockWebContents.send).toHaveBeenNthCalledWith(1, 'transcription-result', response1)
      expect(mockWebContents.send).toHaveBeenNthCalledWith(2, 'transcription-result', response2)
    })

    test('should handle empty transcription result', () => {
      const response = { transcript: '' }

      windowMessenger.sendTranscriptionResult(response)

      expect(mockWebContents.send).toHaveBeenCalledWith('transcription-result', response)
    })

    test('should handle null transcription result', () => {
      windowMessenger.sendTranscriptionResult(null)

      expect(mockWebContents.send).toHaveBeenCalledWith('transcription-result', null)
    })

    test('should handle transcription result sending error gracefully', () => {
      mockWebContents.send.mockImplementation(() => {
        throw new Error('WebContents send failed')
      })

      // Should not throw
      expect(() => {
        windowMessenger.sendTranscriptionResult({ transcript: 'test' })
      }).not.toThrow()

      expect(mockWebContents.send).toHaveBeenCalled()
    })
  })

  describe('Transcription Error Messaging', () => {
    beforeEach(() => {
      const mockWindow = mockBrowserWindow as any
      windowMessenger.setMainWindow(mockWindow)
    })

    test('should send transcription error when window is valid', () => {
      const error = { message: 'Transcription failed', code: 'NETWORK_ERROR' }

      windowMessenger.sendTranscriptionError(error)

      expect(mockWebContents.send).toHaveBeenCalledWith('transcription-error', error)
    })

    test('should send different error types', () => {
      const error1 = { message: 'Network timeout' }
      const error2 = new Error('Audio processing failed')

      windowMessenger.sendTranscriptionError(error1)
      windowMessenger.sendTranscriptionError(error2)

      expect(mockWebContents.send).toHaveBeenCalledTimes(2)
      expect(mockWebContents.send).toHaveBeenNthCalledWith(1, 'transcription-error', error1)
      expect(mockWebContents.send).toHaveBeenNthCalledWith(2, 'transcription-error', error2)
    })

    test('should handle string error', () => {
      const error = 'Simple error message'

      windowMessenger.sendTranscriptionError(error)

      expect(mockWebContents.send).toHaveBeenCalledWith('transcription-error', error)
    })

    test('should handle null error', () => {
      windowMessenger.sendTranscriptionError(null)

      expect(mockWebContents.send).toHaveBeenCalledWith('transcription-error', null)
    })

    test('should not send error when window is invalid', () => {
      windowMessenger.setMainWindow(null)

      windowMessenger.sendTranscriptionError({ message: 'test error' })

      expect(mockWebContents.send).not.toHaveBeenCalled()
    })

    test('should handle error sending error gracefully', () => {
      mockWebContents.send.mockImplementation(() => {
        throw new Error('WebContents send failed')
      })

      // Should not throw
      expect(() => {
        windowMessenger.sendTranscriptionError({ message: 'test error' })
      }).not.toThrow()

      expect(mockWebContents.send).toHaveBeenCalled()
    })
  })

  describe('canSendMessage method', () => {
    test('should return false when no window is set', () => {
      const result = windowMessenger['canSendMessage']()
      expect(result).toBe(false)
    })

    test('should return false when window is destroyed', () => {
      const mockWindow = mockBrowserWindow as any
      mockBrowserWindow.isDestroyed.mockReturnValue(true)

      windowMessenger.setMainWindow(mockWindow)
      const result = windowMessenger['canSendMessage']()

      expect(result).toBe(false)
    })

    test('should return false when webContents is destroyed', () => {
      const mockWindow = mockBrowserWindow as any
      mockWebContents.isDestroyed.mockReturnValue(true)

      windowMessenger.setMainWindow(mockWindow)
      const result = windowMessenger['canSendMessage']()

      expect(result).toBe(false)
    })

    test('should return true when window and webContents are valid', () => {
      const mockWindow = mockBrowserWindow as any

      windowMessenger.setMainWindow(mockWindow)
      const result = windowMessenger['canSendMessage']()

      expect(result).toBe(true)
    })
  })
})