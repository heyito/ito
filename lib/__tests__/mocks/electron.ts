import { mock } from 'bun:test'

// Mock electron app
export const mockApp = mock(() => ({
  getPath: mock((name: string) => {
    const paths: Record<string, string> = {
      userData: '/tmp/test-ito-app',
      documents: '/tmp/test-documents',
      desktop: '/tmp/test-desktop',
    }
    return paths[name] || '/tmp/test-default'
  }),
  quit: mock(() => {}),
}))

// Mock BrowserWindow
export const mockBrowserWindow = mock(() => ({
  webContents: {
    send: mock((_channel: string, ..._args: any[]) => {}),
  },
  isDestroyed: mock(() => false),
  loadURL: mock((_url: string) => Promise.resolve()),
  close: mock(() => {}),
}))

// Mock IPC Main
export const mockIpcMain = mock(() => ({
  handle: mock((_channel: string, _handler: (...args: any[]) => any) => {}),
  on: mock((_channel: string, _handler: (...args: any[]) => any) => {}),
  removeAllListeners: mock((_channel?: string) => {}),
}))

// Mock IPC Renderer
export const mockIpcRenderer = mock(() => ({
  invoke: mock((_channel: string, ..._args: any[]) => Promise.resolve()),
  send: mock((_channel: string, ..._args: any[]) => {}),
  on: mock((_channel: string, _handler: (...args: any[]) => any) => {}),
  removeAllListeners: mock((_channel?: string) => {}),
}))

// Mock context bridge
export const mockContextBridge = mock(() => ({
  exposeInMainWorld: mock((_apiKey: string, _api: any) => {}),
}))

// Mock electron store
export const mockElectronStore = mock(() => {
  const store = new Map()

  return {
    get: mock(
      (key: string, defaultValue?: any) => store.get(key) ?? defaultValue,
    ),
    set: mock((key: string, value: any) => store.set(key, value)),
    delete: mock((key: string) => store.delete(key)),
    clear: mock(() => store.clear()),
    has: mock((key: string) => store.has(key)),
    size: store.size,
    store: Object.fromEntries(store),
  }
})

// Reset function for clearing all mocks
export const resetElectronMocks = () => {
  mockApp.mockClear()
  mockBrowserWindow.mockClear()
  mockIpcMain.mockClear()
  mockIpcRenderer.mockClear()
  mockContextBridge.mockClear()
  mockElectronStore.mockClear()
}
