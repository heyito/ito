import { type BrowserWindow, ipcMain, screen, shell, systemPreferences } from 'electron'
import os from 'os'
import { app } from 'electron'
import store from '../main/store'
import {
  initializeKeyListener,
  KeyListenerProcess,
  stopKeyListener,
} from '../media/keyboard'
// import { getPillWindow } from '../main/app'

const handleIPC = (channel: string, handler: (...args: any[]) => void) => {
  ipcMain.handle(channel, handler)
}

// IPC listener
ipcMain.on('electron-store-get', async (event, val) => {
  event.returnValue = store.get(val)
})
ipcMain.on('electron-store-set', async (_event, key, val) => {
  store.set(key, val)
})

export const registerWindowIPC = (mainWindow: BrowserWindow) => {
  // Hide the menu bar
  mainWindow.setMenuBarVisibility(false)

  handleIPC('start-key-listener', () => {
    if (!KeyListenerProcess) {
      initializeKeyListener(mainWindow)
    }
    return true
  })

  handleIPC('stop-key-listener', () => {
    stopKeyListener()
    return true
  })

  handleIPC('block-keys', (_e, keys: string[]) => {
    if (KeyListenerProcess) {
      KeyListenerProcess.stdin?.write(
        JSON.stringify({ command: 'block', keys }) + '\n'
      )
    }
  })

  handleIPC('unblock-key', (_e, key: string) => {
    if (KeyListenerProcess) {
      KeyListenerProcess.stdin?.write(
        JSON.stringify({ command: 'unblock', key }) + '\n'
      )
    }
  })

  handleIPC('get-blocked-keys', () => {
    if (KeyListenerProcess) {
      KeyListenerProcess.stdin?.write(
        JSON.stringify({ command: 'get_blocked' }) + '\n'
      )
    }
  })

  // Register window IPC
  handleIPC('init-window', () => {
    const { width, height } = mainWindow.getBounds()
    const minimizable = mainWindow.isMinimizable()
    const maximizable = mainWindow.isMaximizable()
    const platform = os.platform()

    return { width, height, minimizable, maximizable, platform }
  })

  handleIPC('is-window-minimizable', () => mainWindow.isMinimizable())
  handleIPC('is-window-maximizable', () => mainWindow.isMaximizable())
  handleIPC('window-minimize', () => mainWindow.minimize())
  handleIPC('window-maximize', () => mainWindow.maximize())
  handleIPC('window-close', () => {
    stopKeyListener()
    mainWindow.close()
  })
  handleIPC('window-maximize-toggle', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  const webContents = mainWindow.webContents
  handleIPC('web-undo', () => webContents.undo())
  handleIPC('web-redo', () => webContents.redo())
  handleIPC('web-cut', () => webContents.cut())
  handleIPC('web-copy', () => webContents.copy())
  handleIPC('web-paste', () => webContents.paste())
  handleIPC('web-delete', () => webContents.delete())
  handleIPC('web-select-all', () => webContents.selectAll())
  handleIPC('web-reload', () => webContents.reload())
  handleIPC('web-force-reload', () => webContents.reloadIgnoringCache())
  handleIPC('web-toggle-devtools', () => webContents.toggleDevTools())
  handleIPC('web-actual-size', () => webContents.setZoomLevel(0))
  handleIPC('web-zoom-in', () =>
    webContents.setZoomLevel(webContents.zoomLevel + 0.5)
  )
  handleIPC('web-zoom-out', () =>
    webContents.setZoomLevel(webContents.zoomLevel - 0.5)
  )
  handleIPC('web-toggle-fullscreen', () =>
    mainWindow.setFullScreen(!mainWindow.fullScreen)
  )
  handleIPC('web-open-url', (_e, url) => shell.openExternal(url))
  // Accessibility permission check
  handleIPC(
    'check-accessibility-permission',
    (_event, prompt: boolean = false) => {
      console.log('check-accessibility-permission', systemPreferences.isTrustedAccessibilityClient(prompt))
      return systemPreferences.isTrustedAccessibilityClient(prompt)
    }
  )

  // Microphone permission check
  handleIPC(
    'check-microphone-permission',
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

  // Clean up key listener on app quit
  app.on('before-quit', () => {
    stopKeyListener()
  })
}

// ipcMain.on('recording-state-changed', (_event, state: { isRecording: boolean; deviceId: string }) => {
//   // Its ONLY job is to forward the state to the pill's renderer.
//   getPillWindow()?.webContents.send('recording-state-update', state)
// })
