import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock all external dependencies
const mockJoin = mock((...paths: string[]) => paths.join('/'))
mock.module('path', () => ({
  join: mockJoin,
}))
// Some environments resolve to node:path; mock that as well
mock.module('node:path', () => ({
  join: mockJoin,
}))

const mockApp = {
  isPackaged: false,
}
mock.module('electron', () => ({
  app: mockApp,
}))

const mockOs = {
  platform: mock(() => 'darwin'),
  arch: mock(() => 'arm64'),
}
mock.module('os', () => ({
  default: mockOs,
}))

// Mock console to avoid spam
beforeEach(() => {
  console.error = mock()
})

describe('Native Interface Module', () => {
  // NOTE: Dynamic imports (await import('./native-interface')) are required because
  // the module uses top-level constants that are evaluated at import time:
  // - const platform = os.platform()
  // - const isDev = !app.isPackaged
  // These need to be mocked before the module is imported to ensure tests use
  // the correct mocked values instead of real platform detection.
  beforeEach(() => {
    // Reset all mocks
    mockJoin.mockClear()
    mockOs.platform.mockClear()
    mockOs.arch.mockClear()

    // Reset module state
    delete require.cache[require.resolve('./native-interface')]

    // Set default platform and arch
    mockOs.platform.mockReturnValue('darwin')
    mockOs.arch.mockReturnValue('arm64')
    mockApp.isPackaged = false
  })

  describe('Platform-Specific Path Resolution Business Logic', () => {
    test('should resolve Darwin development binary path correctly', async () => {
      mockOs.platform.mockReturnValue('darwin')
      mockOs.arch.mockReturnValue('arm64')
      // ensure dev mode
      mockApp.isPackaged = false
      const { getNativeBinaryPath } = await import('./native-interface')

      const result = getNativeBinaryPath('global-key-listener')

      expect(mockJoin).toHaveBeenLastCalledWith(
        expect.stringContaining('native/target/aarch64-apple-darwin/release'),
        'global-key-listener',
      )
      expect(result).toContain(
        'aarch64-apple-darwin/release/global-key-listener',
      )
    })

    test('should resolve Windows development binary path correctly', async () => {
      mockOs.platform.mockReturnValue('win32')
      mockApp.isPackaged = false
      const { getNativeBinaryPath } = await import('./native-interface')

      const result = getNativeBinaryPath('audio-recorder')

      expect(mockJoin).toHaveBeenLastCalledWith(
        expect.stringContaining('native/target/x86_64-pc-windows-msvc/release'),
        'audio-recorder.exe',
      )
      expect(result).toContain(
        'x86_64-pc-windows-msvc/release/audio-recorder.exe',
      )
    })

    test('should handle unsupported development platforms gracefully', async () => {
      mockOs.platform.mockReturnValue('linux')
      mockApp.isPackaged = false
      const { getNativeBinaryPath } = await import('./native-interface')

      const result = getNativeBinaryPath('test-module')

      expect(console.error).toHaveBeenCalledWith(
        'Cannot determine test-module binary path for platform linux',
      )
      expect(result).toBeNull()
    })

    test('should handle FreeBSD development platform gracefully', async () => {
      mockOs.platform.mockReturnValue('freebsd')
      mockApp.isPackaged = false
      const { getNativeBinaryPath } = await import('./native-interface')

      const result = getNativeBinaryPath('test-module')

      expect(console.error).toHaveBeenCalledWith(
        'Cannot determine test-module binary path for platform freebsd',
      )
      expect(result).toBeNull()
    })
  })

  describe('Production Mode Business Logic', () => {
    test('should resolve production binary path for any platform', async () => {
      mockApp.isPackaged = true
      mockOs.platform.mockReturnValue('darwin')

      const originalResourcesPath = process.resourcesPath
      Object.defineProperty(process, 'resourcesPath', {
        value: '/app/resources',
        configurable: true,
      })

      try {
        const { getNativeBinaryPath } = await import('./native-interface')

        const result = getNativeBinaryPath('global-key-listener')

        expect(mockJoin).toHaveBeenLastCalledWith(
          '/app/resources/binaries',
          'global-key-listener',
        )
        expect(result).toBe('/app/resources/binaries/global-key-listener')
      } finally {
        Object.defineProperty(process, 'resourcesPath', {
          value: originalResourcesPath,
          configurable: true,
        })
      }
    })

    test('should add .exe extension for Windows in production', async () => {
      mockApp.isPackaged = true
      mockOs.platform.mockReturnValue('win32')

      const originalResourcesPath = process.resourcesPath
      Object.defineProperty(process, 'resourcesPath', {
        value: 'C:\\app\\resources',
        configurable: true,
      })

      try {
        const { getNativeBinaryPath } = await import('./native-interface')

        const result = getNativeBinaryPath('audio-recorder')

        expect(mockJoin).toHaveBeenLastCalledWith(
          'C:\\app\\resources/binaries',
          'audio-recorder.exe',
        )
        expect(result).toBe('C:\\app\\resources/binaries/audio-recorder.exe')
      } finally {
        Object.defineProperty(process, 'resourcesPath', {
          value: originalResourcesPath,
          configurable: true,
        })
      }
    })

    test('should handle missing resourcesPath in production gracefully', async () => {
      mockApp.isPackaged = true

      const originalResourcesPath = process.resourcesPath
      delete (process as any).resourcesPath

      try {
        const { getNativeBinaryPath } = await import('./native-interface')

        const result = getNativeBinaryPath('test-module')

        // Should still work but may use undefined path
        expect(mockJoin).toHaveBeenCalled()
        expect(result).toBeTypeOf('string')
      } finally {
        if (originalResourcesPath) {
          Object.defineProperty(process, 'resourcesPath', {
            value: originalResourcesPath,
            configurable: true,
          })
        }
      }
    })
  })

  describe('Development vs Production Mode Business Logic', () => {
    test('should use different path strategies for development vs production', async () => {
      mockOs.platform.mockReturnValue('darwin')

      // Test development mode
      mockApp.isPackaged = false
      delete require.cache[require.resolve('./native-interface')]
      const devImport = await import('./native-interface')
      const devResult = devImport.getNativeBinaryPath('test-module')

      // Test production mode
      mockApp.isPackaged = true
      const originalResourcesPath = process.resourcesPath
      Object.defineProperty(process, 'resourcesPath', {
        value: '/app/resources',
        configurable: true,
      })

      try {
        delete require.cache[require.resolve('./native-interface')]
        const prodImport = await import('./native-interface')
        const prodResult = prodImport.getNativeBinaryPath('test-module')

        expect(devResult).toContain('target/aarch64-apple-darwin/release')
        expect(prodResult).toContain('resources/binaries')
        expect(devResult).not.toBe(prodResult)
      } finally {
        Object.defineProperty(process, 'resourcesPath', {
          value: originalResourcesPath,
          configurable: true,
        })
      }
    })
  })

  describe('Error Handling Business Logic', () => {
    test('should return null and log error for unsupported platforms', async () => {
      mockOs.platform.mockReturnValue('unsupported-platform')
      const { getNativeBinaryPath } = await import('./native-interface')

      const result = getNativeBinaryPath('test-module')

      expect(console.error).toHaveBeenCalledWith(
        'Cannot determine test-module binary path for platform unsupported-platform',
      )
      expect(result).toBeNull()
    })

    test('should handle different module names correctly', async () => {
      mockOs.platform.mockReturnValue('darwin')
      const { getNativeBinaryPath } = await import('./native-interface')

      const result1 = getNativeBinaryPath('audio-recorder')
      const result2 = getNativeBinaryPath('global-key-listener')

      expect(result1).toContain('audio-recorder')
      expect(result2).toContain('global-key-listener')
      expect(result1).not.toBe(result2)
    })
  })
})
