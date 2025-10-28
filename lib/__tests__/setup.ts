import { mock, afterEach, beforeEach, beforeAll } from 'bun:test'
import { promises as fs } from 'fs'

// Simple, direct electron mock following Bun documentation pattern
mock.module('electron', () => {
  return {
    app: {
      getPath: (type: string) => {
        if (type === 'userData') return '/tmp/test-ito-app'
        return '/tmp/test-path'
      },
      quit: () => {},
      on: () => {},
      getName: () => 'Ito',
      getVersion: () => '1.0.0',
      whenReady: () => Promise.resolve(),
      isReady: () => true,
      isPackaged: false,
      dock: {
        hide: () => {},
        show: () => {},
      },
    },
    BrowserWindow: class MockBrowserWindow {
      webContents: any

      constructor() {
        this.webContents = {
          send: () => {},
          on: () => {},
          openDevTools: () => {},
        }
      }
      loadURL() {}
      loadFile() {}
      on() {}
      once() {}
      show() {}
      hide() {}
      close() {}
      destroy() {}
      minimize() {}
      maximize() {}
      restore() {}
      focus() {}
      blur() {}
      isFocused() {
        return true
      }
      isVisible() {
        return true
      }
      isMinimized() {
        return false
      }
      isMaximized() {
        return false
      }
      setTitle() {}
      getTitle() {
        return 'Test Window'
      }
    },
    shell: {
      openExternal: () => {},
      showItemInFolder: () => {},
      openPath: () => {},
    },
    screen: {
      getPrimaryDisplay: () => ({
        workAreaSize: { width: 1920, height: 1080 },
        size: { width: 1920, height: 1080 },
      }),
      getAllDisplays: () => [],
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    },
    protocol: {
      registerSchemesAsPrivileged: () => {},
      registerFileProtocol: () => {},
      registerHttpProtocol: () => {},
      registerBufferProtocol: () => {},
      registerStringProtocol: () => {},
      unregisterProtocol: () => {},
    },
    net: {
      request: () => {},
    },
    ipcMain: {
      on: () => {},
      once: () => {},
      handle: () => {},
      handleOnce: () => {},
      removeAllListeners: () => {},
      removeHandler: () => {},
    },
    ipcRenderer: {
      invoke: () => {},
      send: () => {},
      on: () => {},
      once: () => {},
      removeAllListeners: () => {},
      removeListener: () => {},
      sendSync: (channel: string) => {
        if (channel === 'electron-store-get-data') {
          return {
            encryptionKey: null,
            migrations: {},
            projectVersion: '1.0.0',
            projectSuffix: 'test',
            defaults: {},
            name: 'config',
            builtinMigrations: false,
            clearInvalidConfig: false,
            serialize: null,
            deserialize: null,
            appVersion: '1.0.0',
            path: '/tmp/test-config.json',
          }
        }
        return null
      },
    },
    contextBridge: {
      exposeInMainWorld: () => {},
    },
    systemPreferences: {
      askForMediaAccess: () => {},
      getMediaAccessStatus: () => 'granted',
      getAnimationSettings: () => ({ shouldRenderRichAnimation: true }),
    },
    powerSaveBlocker: {
      start: () => 1,
      stop: () => {},
      isStarted: () => false,
    },
    Menu: class MockMenu {},
    MenuItem: class MockMenuItem {},
    Tray: class MockTray {},
    Notification: class MockNotification {},
    dialog: {
      showOpenDialog: () => {},
      showSaveDialog: () => {},
      showMessageBox: () => {},
      showErrorBox: () => {},
    },
    clipboard: {
      writeText: () => {},
      readText: () => '',
    },
    nativeTheme: {
      shouldUseDarkColors: false,
      on: () => {},
    },
    IpcRendererEvent: class MockIpcRendererEvent {},
    IpcMainEvent: class MockIpcMainEvent {},
    autoUpdater: {
      quitAndInstall: () => {},
    },
    powerMonitor: {
      on: () => {},
      getSystemIdleState: () => 'active',
      getSystemIdleTime: () => 0,
    },
    crashReporter: {
      start: () => {},
      getLastCrashReport: () => null,
      getUploadedReports: () => [],
      getUploadToServer: () => true,
      setUploadToServer: () => {},
    },
    nativeImage: {
      createEmpty: () => ({}),
      createFromPath: () => ({}),
      createFromBuffer: () => ({}),
      createFromDataURL: () => ({}),
    },
  }
})

console.log('✓ Electron module mocked')

// Global fallback mocks to prevent cross-test leakage
// 1) Provide a safe default for selected-text-reader's getCursorContext if not mocked elsewhere
try {
  const existing = await import('../media/selected-text-reader')
  if (typeof (existing as any).getCursorContext !== 'function') {
    mock.module('../media/selected-text-reader', () => ({
      getCursorContext: async () => '',
    }))
  }
} catch {
  mock.module('../media/selected-text-reader', () => ({
    getCursorContext: async () => '',
  }))
}

// 2) Ensure node:path join maps to path.join when tests mock path
const pathMod = await import('path')
mock.module('node:path', () => ({ join: (pathMod as any).join }))

// Initialize SQLite once for tests that touch the KeyValueStore
beforeAll(async () => {
  // Ensure test userData directory exists for SQLite file
  await fs.mkdir('/tmp/test-ito-app', { recursive: true })
  try {
    // Import after mocking electron so the mock is applied
    const { initializeDatabase } = await import('../main/sqlite/db')
    await initializeDatabase()
  } catch (e) {
    console.log(
      '✓ Skipping DB init in this test run:',
      (e as any)?.message || e,
    )
  }
})

// Store original console methods for restoration
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
}

// Export function to restore console if needed in specific tests
;(global as any).restoreConsole = () => {
  Object.assign(console, originalConsole)
}

// Global setup: suppress console during test execution
beforeEach(() => {
  // Suppress implementation console output during each test
  global.console = {
    ...console,
    log: () => {}, // Suppress implementation logs
    error: () => {}, // Suppress implementation errors
    warn: () => {}, // Suppress implementation warnings
    info: () => {}, // Suppress implementation info
  }
})

// Global mock cleanup after each test
afterEach(() => {
  // Restore console first
  Object.assign(console, originalConsole)

  // Clear all mock function calls and implementations
  mock.restore()
})
