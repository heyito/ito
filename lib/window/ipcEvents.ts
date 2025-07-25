import {
  BrowserWindow,
  ipcMain,
  shell,
  systemPreferences,
  app,
  autoUpdater,
} from 'electron'
import log from 'electron-log'
import os from 'os'
import store, { getCurrentUserId } from '../main/store'

import {
  startKeyListener,
  KeyListenerProcess,
  stopKeyListener,
} from '../media/keyboard'
import { getPillWindow, mainWindow } from '../main/app'
import {
  generateNewAuthState,
  exchangeAuthCode,
  handleLogin,
  handleLogout,
  ensureValidTokens,
} from '../auth/events'
import { Auth0Config } from '../auth/config'
import {
  NotesTable,
  DictionaryTable,
  InteractionsTable,
} from '../main/sqlite/repo'
import { audioRecorderService } from '../media/audio'
import { voiceInputService } from '../main/voiceInputService'

const handleIPC = (channel: string, handler: (...args: any[]) => any) => {
  ipcMain.handle(channel, handler)
}

// This single function registers all IPC handlers for the application.
// It should only be called once.
export function registerIPC() {
  // Store
  ipcMain.on('electron-store-get', (event, val) => {
    event.returnValue = store.get(val)
  })
  ipcMain.on('electron-store-set', (_event, key, val) => {
    store.set(key, val)
  })

  ipcMain.on('audio-devices-changed', () => {
    log.info('[IPC] Audio devices changed, notifying windows.')
    // Notify all windows to refresh their device lists in the UI.
    mainWindow?.webContents.send('force-device-list-reload')
    getPillWindow()?.webContents.send('force-device-list-reload')
  })

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall()
  })

  // Login Item Settings
  handleIPC('set-login-item-settings', (_e, enabled: boolean) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: false,
      })
      log.info(`Successfully set login item to: ${enabled}`)
    } catch (error: any) {
      log.error('Failed to set login item settings:', error)
    }
  })
  handleIPC('get-login-item-settings', () => {
    try {
      return app.getLoginItemSettings()
    } catch (error: any) {
      log.error('Failed to get login item settings:', error)
      return { openAtLogin: false, openAsHidden: false }
    }
  })

  // Dock Settings (macOS only)
  handleIPC('set-dock-visibility', (_e, visible: boolean) => {
    try {
      if (process.platform === 'darwin') {
        if (visible) {
          app.dock?.show()
        } else {
          app.dock?.hide()
        }
        log.info(`Successfully set dock visibility to: ${visible}`)
      } else {
        log.warn('Dock visibility setting is only available on macOS')
      }
    } catch (error: any) {
      log.error('Failed to set dock visibility:', error)
    }
  })
  handleIPC('get-dock-visibility', () => {
    try {
      if (process.platform === 'darwin' && app.dock) {
        const isVisible = app.dock.isVisible()
        return { isVisible }
      } else {
        log.warn('Dock visibility check is only available on macOS')
        return { isVisible: true } // Default to visible on non-macOS platforms
      }
    } catch (error: any) {
      log.error('Failed to get dock visibility:', error)
      return { isVisible: true }
    }
  })

  // Key Listener
  handleIPC('start-key-listener-service', () => {
    startKeyListener()
  })
  handleIPC('stop-key-listener', () => stopKeyListener())
  handleIPC('start-native-recording-service', () =>
    voiceInputService.startSTTService(),
  )
  handleIPC('stop-native-recording-service', () =>
    voiceInputService.stopSTTService(),
  )
  handleIPC('block-keys', (_e, keys: string[]) => {
    if (KeyListenerProcess)
      KeyListenerProcess.stdin?.write(
        JSON.stringify({ command: 'block', keys }) + '\n',
      )
  })
  handleIPC('unblock-key', (_e, key: string) => {
    if (KeyListenerProcess)
      KeyListenerProcess.stdin?.write(
        JSON.stringify({ command: 'unblock', key }) + '\n',
      )
  })
  handleIPC('get-blocked-keys', () => {
    if (KeyListenerProcess)
      KeyListenerProcess.stdin?.write(
        JSON.stringify({ command: 'get_blocked' }) + '\n',
      )
  })

  // Permissions
  handleIPC('check-accessibility-permission', (_e, prompt: boolean = false) =>
    systemPreferences.isTrustedAccessibilityClient(prompt),
  )
  handleIPC(
    'check-microphone-permission',
    async (_e, prompt: boolean = false) => {
      if (prompt) return systemPreferences.askForMediaAccess('microphone')
      return systemPreferences.getMediaAccessStatus('microphone') === 'granted'
    },
  )

  // Auth
  handleIPC('generate-new-auth-state', () => generateNewAuthState())
  handleIPC('exchange-auth-code', async (_e, { authCode, state, config }) =>
    exchangeAuthCode(_e, { authCode, state, config }),
  )
  handleIPC('logout', () => handleLogout())
  handleIPC('notify-login-success', (_e, { profile, idToken, accessToken }) => {
    handleLogin(profile, idToken, accessToken)
  })

  // Token refresh handler
  handleIPC('refresh-tokens', async () => {
    try {
      const result = await ensureValidTokens(Auth0Config)
      return result
    } catch (error) {
      console.error('Manual token refresh failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  // Window Init & Controls
  const getWindowFromEvent = (event: Electron.IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(event.sender)
  handleIPC('init-window', e => {
    const window = getWindowFromEvent(e)
    if (!window) return {}
    const { width, height } = window.getBounds()
    return {
      width,
      height,
      minimizable: window.isMinimizable(),
      maximizable: window.isMaximizable(),
      platform: os.platform(),
    }
  })
  handleIPC('is-window-minimizable', e =>
    getWindowFromEvent(e)?.isMinimizable(),
  )
  handleIPC('is-window-maximizable', e =>
    getWindowFromEvent(e)?.isMaximizable(),
  )
  handleIPC('window-minimize', e => getWindowFromEvent(e)?.minimize())
  handleIPC('window-maximize', e => getWindowFromEvent(e)?.maximize())
  handleIPC('window-close', e => getWindowFromEvent(e)?.close())
  handleIPC('window-maximize-toggle', e => {
    const window = getWindowFromEvent(e)
    if (window?.isMaximized()) window.unmaximize()
    else window?.maximize()
  })

  // Web Contents & Other
  const getWebContentsFromEvent = (
    event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  ) => event.sender
  handleIPC('web-undo', e => getWebContentsFromEvent(e).undo())
  handleIPC('web-redo', e => getWebContentsFromEvent(e).redo())
  handleIPC('web-cut', e => getWebContentsFromEvent(e).cut())
  handleIPC('web-copy', e => getWebContentsFromEvent(e).copy())
  handleIPC('web-paste', e => getWebContentsFromEvent(e).paste())
  handleIPC('web-delete', e => getWebContentsFromEvent(e).delete())
  handleIPC('web-select-all', e => getWebContentsFromEvent(e).selectAll())
  handleIPC('web-reload', e => getWebContentsFromEvent(e).reload())
  handleIPC('web-force-reload', e =>
    getWebContentsFromEvent(e).reloadIgnoringCache(),
  )
  handleIPC('web-toggle-devtools', e =>
    getWebContentsFromEvent(e).toggleDevTools(),
  )
  handleIPC('web-actual-size', e => getWebContentsFromEvent(e).setZoomLevel(0))
  handleIPC('web-zoom-in', e =>
    getWebContentsFromEvent(e).setZoomLevel(
      getWebContentsFromEvent(e).getZoomLevel() + 0.5,
    ),
  )
  handleIPC('web-zoom-out', e =>
    getWebContentsFromEvent(e).setZoomLevel(
      getWebContentsFromEvent(e).getZoomLevel() - 0.5,
    ),
  )
  handleIPC('web-toggle-fullscreen', e => {
    const window = getWindowFromEvent(e)
    window?.setFullScreen(!window.isFullScreen())
  })
  handleIPC('web-open-url', (_e, url) => shell.openExternal(url))
  handleIPC('get-native-audio-devices', async () => {
    log.info(
      '[IPC] Received get-native-audio-devices, calling requestDeviceListPromise...',
    )
    return audioRecorderService.getDeviceList()
  })

  // App lifecycle
  app.on('before-quit', () => stopKeyListener())

  // Notes
  handleIPC('notes:get-all', () => {
    const user_id = getCurrentUserId()
    return NotesTable.findAll(user_id)
  })
  handleIPC('notes:add', async (_e, note) => NotesTable.insert(note))
  handleIPC('notes:update-content', async (_e, { id, content }) =>
    NotesTable.updateContent(id, content),
  )
  handleIPC('notes:delete', async (_e, id) => NotesTable.softDelete(id))

  // Dictionary
  handleIPC('dictionary:get-all', () => {
    const user_id = getCurrentUserId()
    return DictionaryTable.findAll(user_id)
  })
  handleIPC('dictionary:add', async (_e, item) => DictionaryTable.insert(item))
  handleIPC('dictionary:update', async (_e, { id, word, pronunciation }) =>
    DictionaryTable.update(id, word, pronunciation),
  )
  handleIPC('dictionary:delete', async (_e, id) =>
    DictionaryTable.softDelete(id),
  )

  // Interactions
  handleIPC('interactions:get-all', () => {
    const user_id = getCurrentUserId()
    return InteractionsTable.findAll(user_id)
  })
  handleIPC('interactions:get-by-id', async (_e, id) =>
    InteractionsTable.findById(id),
  )

  handleIPC('interactions:delete', async (_e, id) =>
    InteractionsTable.softDelete(id),
  )

  // User Data Deletion
  handleIPC('delete-user-data', async _e => {
    const userId = getCurrentUserId()
    if (!userId) {
      log.error('No user ID found to delete data.')
      return false
    }
    const { deleteCompleteUserData } = await import('../main/sqlite/db')
    return deleteCompleteUserData(userId)
  })

  // Server health check
  handleIPC('check-server-health', async () => {
    try {
      const response = await fetch(
        `http://localhost:${import.meta.env.VITE_LOCAL_SERVER_PORT}`,
        {
          method: 'GET',
        },
      )

      if (response.ok) {
        const text = await response.text()
        const isValidResponse = text.includes(
          'Welcome to the Ito Connect RPC server!',
        )

        return {
          isHealthy: isValidResponse,
          error: isValidResponse ? undefined : 'Invalid server response',
        }
      } else {
        return {
          isHealthy: false,
          error: `Server responded with status: ${response.status}`,
        }
      }
    } catch (error: any) {
      const errorMessage =
        error.name === 'TimeoutError' || error.name === 'AbortError'
          ? 'Connection timed out'
          : error.message?.includes('ECONNREFUSED') ||
              error.message?.includes('fetch')
            ? 'Local server not running'
            : error.message || 'Unknown error occurred'

      return {
        isHealthy: false,
        error: errorMessage,
      }
    }
  })

  // Debug methods
  handleIPC('debug:check-schema', async () => {
    const { getDb } = await import('../main/sqlite/db.js')
    const db = getDb()
    return new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(interactions)', (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  })

  // Pill window mouse event control
  handleIPC(
    'pill-set-mouse-events',
    (_e, ignore: boolean, options?: { forward?: boolean }) => {
      const pillWindow = getPillWindow()
      if (pillWindow) {
        pillWindow.setIgnoreMouseEvents(ignore, options)
      }
    },
  )

  // When the hotkey is pressed, start recording and notify the pill window.
  ipcMain.on('start-native-recording', _event => {
    log.info(`IPC: Received 'start-native-recording'`)
    voiceInputService.startSTTService()
  })

  ipcMain.on('start-native-recording-test', _event => {
    log.info(`IPC: Received 'start-native-recording-test'`)
    const sendToServer = false
    voiceInputService.startSTTService(sendToServer)
  })

  // When the hotkey is released, stop recording and notify the pill window.
  ipcMain.on('stop-native-recording', () => {
    log.info('IPC: Received stop-native-recording.')
    voiceInputService.stopSTTService()
  })
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

  handleIPC(`is-window-minimizable-${mainWindow.id}`, () =>
    mainWindow.isMinimizable(),
  )
  handleIPC(`is-window-maximizable-${mainWindow.id}`, () =>
    mainWindow.isMaximizable(),
  )
  handleIPC(`window-minimize-${mainWindow.id}`, () => mainWindow.minimize())
  handleIPC(`window-maximize-${mainWindow.id}`, () => mainWindow.maximize())
  handleIPC(`window-close-${mainWindow.id}`, () => {
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
  handleIPC(`web-force-reload-${mainWindow.id}`, () =>
    webContents.reloadIgnoringCache(),
  )
  handleIPC(`web-toggle-devtools-${mainWindow.id}`, () =>
    webContents.toggleDevTools(),
  )
  handleIPC(`web-actual-size-${mainWindow.id}`, () =>
    webContents.setZoomLevel(0),
  )
  handleIPC(`web-zoom-in-${mainWindow.id}`, () =>
    webContents.setZoomLevel(webContents.zoomLevel + 0.5),
  )
  handleIPC(`web-zoom-out-${mainWindow.id}`, () =>
    webContents.setZoomLevel(webContents.zoomLevel - 0.5),
  )
  handleIPC(`web-toggle-fullscreen-${mainWindow.id}`, () =>
    mainWindow.setFullScreen(!mainWindow.fullScreen),
  )
  handleIPC(`web-open-url-${mainWindow.id}`, (_e, url) =>
    shell.openExternal(url),
  )
  // Accessibility permission check
  handleIPC(
    `check-accessibility-permission-${mainWindow.id}`,
    (_event, prompt: boolean = false) => {
      return systemPreferences.isTrustedAccessibilityClient(prompt)
    },
  )

  // Microphone permission check
  handleIPC(
    `check-microphone-permission-${mainWindow.id}`,
    (_event, prompt: boolean = false) => {
      log.info('check-microphone-permission prompt', prompt)
      if (prompt) {
        const res = systemPreferences.askForMediaAccess('microphone')
        log.info('check-microphone-permission askForMediaAccess', res)
        return res
      }
      return systemPreferences.getMediaAccessStatus('microphone') === 'granted'
    },
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

// Forwards volume data from the main window to the pill window
ipcMain.on('volume-update', (_event, volume: number) => {
  getPillWindow()?.webContents.send('volume-update', volume)
})

// Forwards settings updates from the main window to the pill window
ipcMain.on('settings-update', (_event, settings: any) => {
  getPillWindow()?.webContents.send('settings-update', settings)
})

// Forwards onboarding updates from the main window to the pill window
ipcMain.on('onboarding-update', (_event, onboarding: any) => {
  getPillWindow()?.webContents.send('onboarding-update', onboarding)
})
