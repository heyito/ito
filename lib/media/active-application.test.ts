import { describe, expect, mock, test, beforeEach, afterEach } from 'bun:test'
import { ActiveWindow } from './active-application'

const mockActiveWindow: ActiveWindow = {
  title: 'Test Window',
  appName: 'Test App',
  windowId: 123,
  processId: 456,
  positon: {
    x: 100,
    y: 200,
    width: 800,
    height: 600,
  },
}
const mockPathToBinary = '/path/to/binary'
const mockGetNativeBinaryPath = mock()
mock.module('./native-interface', () => ({
  getNativeBinaryPath: mockGetNativeBinaryPath,
}))
const mockExecFile = mock(
  (
    _: string,
    callback: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    callback(null, JSON.stringify(mockActiveWindow), '')
  },
)
mock.module('child_process', () => ({
  execFile: mockExecFile,
}))

// Mock console to avoid spam
beforeEach(() => {
  console.error = mock()
})

describe('active-application', () => {
  beforeEach(() => {
    mockGetNativeBinaryPath.mockReturnValue(mockPathToBinary)
  })

  afterEach(() => {
    mockGetNativeBinaryPath.mockReset()
    mockExecFile.mockReset()
  })

  test('should return active window info when successful', async () => {
    mockGetNativeBinaryPath.mockReturnValue(mockPathToBinary)
    mockExecFile.mockImplementation((_: string, callback) => {
      callback(null, JSON.stringify(mockActiveWindow), '')
    })
    const { getActiveWindow } = await import('./active-application')

    const result = await getActiveWindow()

    expect(result).toEqual(mockActiveWindow)
    expect(mockGetNativeBinaryPath).toHaveBeenCalledWith('active-application')
    expect(mockExecFile).toHaveBeenCalledWith(
      mockPathToBinary,
      expect.any(Function),
    )
  })

  test('should return null when binary path is not found', async () => {
    mockGetNativeBinaryPath.mockReturnValue(null)
    const { getActiveWindow } = await import('./active-application')

    const result = await getActiveWindow()

    expect(result).toBeNull()
    expect(mockExecFile).not.toHaveBeenCalled()
  })

  test('should return null when execFile fails', async () => {
    mockGetNativeBinaryPath.mockReturnValue(mockPathToBinary)
    mockExecFile.mockImplementation((_: string, callback) => {
      callback(new Error('Binary failed'), '', 'Error message')
    })
    const { getActiveWindow } = await import('./active-application')

    const result = await getActiveWindow()

    expect(result).toBeNull()
  })

  test('should parse JSON correctly from stdout', async () => {
    mockGetNativeBinaryPath.mockReturnValue(mockPathToBinary)
    mockExecFile.mockImplementation((_: string, callback) => {
      callback(null, `  ${JSON.stringify(mockActiveWindow)}  \n`, '')
    })
    const { getActiveWindow } = await import('./active-application')

    const result = await getActiveWindow()

    expect(result).toEqual(mockActiveWindow)
  })
})
