import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { checkLocalServerHealth } from './healthCheck'

// Mock the window.api
const mockApi = {
  checkServerHealth: mock(),
}

// Setup global window mock
const originalWindow = globalThis.window
beforeEach(() => {
  globalThis.window = {
    ...originalWindow,
    api: mockApi,
  } as any

  // Clear mock call history
  mockApi.checkServerHealth.mockClear()
})

describe('checkLocalServerHealth', () => {
  test('should return healthy status when server is healthy', async () => {
    // Arrange
    const mockResponse = {
      isHealthy: true,
      error: undefined,
    }
    mockApi.checkServerHealth.mockResolvedValue(mockResponse)

    // Act
    const result = await checkLocalServerHealth()

    // Assert
    expect(result).toEqual({
      isHealthy: true,
      error: undefined,
    })
    expect(mockApi.checkServerHealth).toHaveBeenCalledTimes(1)
  })

  test('should return unhealthy status when server is not running', async () => {
    // Arrange
    const mockResponse = {
      isHealthy: false,
      error: 'Local server not running',
    }
    mockApi.checkServerHealth.mockResolvedValue(mockResponse)

    // Act
    const result = await checkLocalServerHealth()

    // Assert
    expect(result).toEqual({
      isHealthy: false,
      error: 'Local server not running',
    })
    expect(mockApi.checkServerHealth).toHaveBeenCalledTimes(1)
  })

  test('should return unhealthy status when server returns invalid response', async () => {
    // Arrange
    const mockResponse = {
      isHealthy: false,
      error: 'Invalid server response',
    }
    mockApi.checkServerHealth.mockResolvedValue(mockResponse)

    // Act
    const result = await checkLocalServerHealth()

    // Assert
    expect(result).toEqual({
      isHealthy: false,
      error: 'Invalid server response',
    })
    expect(mockApi.checkServerHealth).toHaveBeenCalledTimes(1)
  })

  test('should handle API call errors gracefully', async () => {
    // Arrange
    const error = new Error('IPC communication failed')
    mockApi.checkServerHealth.mockRejectedValue(error)

    // Act
    const result = await checkLocalServerHealth()

    // Assert
    expect(result).toEqual({
      isHealthy: false,
      error: 'IPC communication failed',
    })
    expect(mockApi.checkServerHealth).toHaveBeenCalledTimes(1)
  })

  test('should handle unknown error types', async () => {
    // Arrange
    mockApi.checkServerHealth.mockRejectedValue('Unknown error')

    // Act
    const result = await checkLocalServerHealth()

    // Assert
    expect(result).toEqual({
      isHealthy: false,
      error: 'Unknown error occurred',
    })
    expect(mockApi.checkServerHealth).toHaveBeenCalledTimes(1)
  })

  test('should handle timeout scenarios', async () => {
    // Arrange
    const mockResponse = {
      isHealthy: false,
      error: 'Connection timed out',
    }
    mockApi.checkServerHealth.mockResolvedValue(mockResponse)

    // Act
    const result = await checkLocalServerHealth()

    // Assert
    expect(result).toEqual({
      isHealthy: false,
      error: 'Connection timed out',
    })
    expect(mockApi.checkServerHealth).toHaveBeenCalledTimes(1)
  })
})
