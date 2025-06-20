import { BrowserWindow, ipcMain, screen, shell, systemPreferences, app } from 'electron'
import os from 'os'
import store from '../main/store'
import {
  startKeyListener,
  KeyListenerProcess,
  stopKeyListener,
} from '../media/keyboard'
import { getPillWindow } from '../main/app'
// import { getPillWindow } from '../main/app'

const handleIPC = (channel: string, handler: (...args: any[]) => any) => {
  ipcMain.handle(channel, handler)
}

// This single function registers all IPC handlers for the application.
// It should only be called once.
export function registerIPC() {
  // Store
  ipcMain.on('electron-store-get', (event, val) => { event.returnValue = store.get(val) })
  ipcMain.on('electron-store-set', (_event, key, val) => { store.set(key, val) })

  // Key Listener
  handleIPC('start-key-listener-service', (e) => {
    const window = BrowserWindow.fromWebContents(e.sender)
    if (window) startKeyListener(window)
  })
  handleIPC('stop-key-listener', () => stopKeyListener())
  handleIPC('block-keys', (_e, keys: string[]) => {
    if (KeyListenerProcess) KeyListenerProcess.stdin?.write(JSON.stringify({ command: 'block', keys }) + '\n')
  })
  handleIPC('unblock-key', (_e, key: string) => {
    if (KeyListenerProcess) KeyListenerProcess.stdin?.write(JSON.stringify({ command: 'unblock', key }) + '\n')
  })
  handleIPC('get-blocked-keys', () => {
    if (KeyListenerProcess) KeyListenerProcess.stdin?.write(JSON.stringify({ command: 'get_blocked' }) + '\n')
  })

  // Permissions
  handleIPC('check-accessibility-permission', (_e, prompt: boolean = false) => systemPreferences.isTrustedAccessibilityClient(prompt))
  handleIPC('check-microphone-permission', async (_e, prompt: boolean = false) => {
    if (prompt) return systemPreferences.askForMediaAccess('microphone')
    return systemPreferences.getMediaAccessStatus('microphone') === 'granted'
  })

  // Window Init & Controls
  const getWindowFromEvent = (event: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender)
  handleIPC('init-window', (e) => {
    const window = getWindowFromEvent(e)
    if (!window) return {}
    const { width, height } = window.getBounds()
    return { width, height, minimizable: window.isMinimizable(), maximizable: window.isMaximizable(), platform: os.platform() }
  })
  handleIPC('is-window-minimizable', (e) => getWindowFromEvent(e)?.isMinimizable())
  handleIPC('is-window-maximizable', (e) => getWindowFromEvent(e)?.isMaximizable())
  handleIPC('window-minimize', (e) => getWindowFromEvent(e)?.minimize())
  handleIPC('window-maximize', (e) => getWindowFromEvent(e)?.maximize())
  handleIPC('window-close', (e) => getWindowFromEvent(e)?.close())
  handleIPC('window-maximize-toggle', (e) => {
    const window = getWindowFromEvent(e)
    if (window?.isMaximized()) window.unmaximize()
    else window?.maximize()
  })
  
  // Web Contents & Other
  const getWebContentsFromEvent = (event: Electron.IpcMainInvokeEvent) => event.sender
  handleIPC('web-undo', (e) => getWebContentsFromEvent(e).undo())
  handleIPC('web-redo', (e) => getWebContentsFromEvent(e).redo())
  handleIPC('web-cut', (e) => getWebContentsFromEvent(e).cut())
  handleIPC('web-copy', (e) => getWebContentsFromEvent(e).copy())
  handleIPC('web-paste', (e) => getWebContentsFromEvent(e).paste())
  handleIPC('web-delete', (e) => getWebContentsFromEvent(e).delete())
  handleIPC('web-select-all', (e) => getWebContentsFromEvent(e).selectAll())
  handleIPC('web-reload', (e) => getWebContentsFromEvent(e).reload())
  handleIPC('web-force-reload', (e) => getWebContentsFromEvent(e).reloadIgnoringCache())
  handleIPC('web-toggle-devtools', (e) => getWebContentsFromEvent(e).toggleDevTools())
  handleIPC('web-actual-size', (e) => getWebContentsFromEvent(e).setZoomLevel(0))
  handleIPC('web-zoom-in', (e) => getWebContentsFromEvent(e).setZoomLevel(getWebContentsFromEvent(e).getZoomLevel() + 0.5))
  handleIPC('web-zoom-out', (e) => getWebContentsFromEvent(e).setZoomLevel(getWebContentsFromEvent(e).getZoomLevel() - 0.5))
  handleIPC('web-toggle-fullscreen', (e) => {
    const window = getWindowFromEvent(e)
    window?.setFullScreen(!window.isFullScreen())
  })
  handleIPC('web-open-url', (_e, url) => shell.openExternal(url))
  
  // App lifecycle
  app.on('before-quit', () => stopKeyListener())
}

// Handlers that are specific to a given window instance
export const registerWindowIPC = (mainWindow: BrowserWindow) => {
  // Hide the menu bar
  mainWindow.setMenuBarVisibility(false)

  handleIPC(`init-window-${mainWindow.id}`, () => {
    const { width, height } = mainWindow.getBounds()
    const minimizable = mainWindow.isMinimizable()
    const maximizable = mainWindow.isMaximizable()
    const platform = os.platform()
    return { width, height, minimizable, maximizable, platform }
  })

  handleIPC(`is-window-minimizable-${mainWindow.id}`, () => mainWindow.isMinimizable())
  handleIPC(`is-window-maximizable-${mainWindow.id}`, () => mainWindow.isMaximizable())
  handleIPC(`window-minimize-${mainWindow.id}`, () => mainWindow.minimize())
  handleIPC(`window-maximize-${mainWindow.id}`, () => mainWindow.maximize())
  handleIPC(`window-close-${mainWindow.id}`, () => {
    stopKeyListener()
    mainWindow.close()
  })
  handleIPC(`window-maximize-toggle-${mainWindow.id}`, () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  const webContents = mainWindow.webContents
  handleIPC(`web-undo-${mainWindow.id}`, () => webContents.undo())
  handleIPC(`web-redo-${mainWindow.id}`, () => webContents.redo())
  handleIPC(`web-cut-${mainWindow.id}`, () => webContents.cut())
  handleIPC(`web-copy-${mainWindow.id}`, () => webContents.copy())
  handleIPC(`web-paste-${mainWindow.id}`, () => webContents.paste())
  handleIPC(`web-delete-${mainWindow.id}`, () => webContents.delete())
  handleIPC(`web-select-all-${mainWindow.id}`, () => webContents.selectAll())
  handleIPC(`web-reload-${mainWindow.id}`, () => webContents.reload())
  handleIPC(`web-force-reload-${mainWindow.id}`, () => webContents.reloadIgnoringCache())
  handleIPC(`web-toggle-devtools-${mainWindow.id}`, () => webContents.toggleDevTools())
  handleIPC(`web-actual-size-${mainWindow.id}`, () => webContents.setZoomLevel(0))
  handleIPC(`web-zoom-in-${mainWindow.id}`, () =>
    webContents.setZoomLevel(webContents.zoomLevel + 0.5)
  )
  handleIPC(`web-zoom-out-${mainWindow.id}`, () =>
    webContents.setZoomLevel(webContents.zoomLevel - 0.5)
  )
  handleIPC(`web-toggle-fullscreen-${mainWindow.id}`, () =>
    mainWindow.setFullScreen(!mainWindow.fullScreen)
  )
  handleIPC(`web-open-url-${mainWindow.id}`, (_e, url) => shell.openExternal(url))
  // Accessibility permission check
  handleIPC(
    `check-accessibility-permission-${mainWindow.id}`,
    (_event, prompt: boolean = false) => {
      console.log('check-accessibility-permission', systemPreferences.isTrustedAccessibilityClient(prompt))
      return systemPreferences.isTrustedAccessibilityClient(prompt)
    }
  )

  // Microphone permission check
  handleIPC(
    `check-microphone-permission-${mainWindow.id}`,
    (_event, prompt: boolean = false) => {
      console.log('check-microphone-permission prompt', prompt)
      if (prompt) {
        const res = systemPreferences.askForMediaAccess('microphone')
        console.log('check-microphone-permission askForMediaAccess', res)
        return res
      }
      console.log('check-microphone-permission getMediaAccessStatus', systemPreferences.getMediaAccessStatus('microphone'))
      return systemPreferences.getMediaAccessStatus('microphone') === 'granted'
    }
  )

  // We must remove handlers when the window is closed to prevent memory leaks
  mainWindow.on('closed', () => {
    ipcMain.removeHandler(`window-minimize-${mainWindow.id}`)
    ipcMain.removeHandler(`window-maximize-${mainWindow.id}`)
    ipcMain.removeHandler(`window-close-${mainWindow.id}`)
    ipcMain.removeHandler(`window-maximize-toggle-${mainWindow.id}`)
    ipcMain.removeHandler(`web-undo-${mainWindow.id}`)
    ipcMain.removeHandler(`web-redo-${mainWindow.id}`)
    ipcMain.removeHandler(`web-cut-${mainWindow.id}`)
    ipcMain.removeHandler(`web-copy-${mainWindow.id}`)
    ipcMain.removeHandler(`web-paste-${mainWindow.id}`)
    ipcMain.removeHandler(`web-delete-${mainWindow.id}`)
    ipcMain.removeHandler(`web-select-all-${mainWindow.id}`)
    ipcMain.removeHandler(`web-reload-${mainWindow.id}`)
    ipcMain.removeHandler(`web-force-reload-${mainWindow.id}`)
    ipcMain.removeHandler(`web-toggle-devtools-${mainWindow.id}`)
    ipcMain.removeHandler(`web-actual-size-${mainWindow.id}`)
    ipcMain.removeHandler(`web-zoom-in-${mainWindow.id}`)
    ipcMain.removeHandler(`web-zoom-out-${mainWindow.id}`)
    ipcMain.removeHandler(`web-toggle-fullscreen-${mainWindow.id}`)
    ipcMain.removeHandler(`web-open-url-${mainWindow.id}`)
    ipcMain.removeHandler(`check-accessibility-permission-${mainWindow.id}`)
    ipcMain.removeHandler(`check-microphone-permission-${mainWindow.id}`)
  })
}

ipcMain.on('recording-state-changed', (_event, state: { isRecording: boolean; deviceId: string }) => {
  // Its ONLY job is to forward the state to the pill's renderer.
  getPillWindow()?.webContents.send('recording-state-update', state)
})

// Forwards volume data from the main window to the pill window
ipcMain.on('volume-update', (_event, volume: number) => {
  getPillWindow()?.webContents.send('volume-update', volume)
})
