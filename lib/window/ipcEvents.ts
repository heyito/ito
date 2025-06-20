import {
  type BrowserWindow,
  ipcMain,
  screen,
  shell,
  systemPreferences,
} from 'electron'
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
  handleIPC('start-key-listener-service', () => {
    console.log('start-key-listener-service invoked')
    startKeyListener()
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
        JSON.stringify({ command: 'block', keys }) + '\n',
      )
    }
  })

  handleIPC('unblock-key', (_e, key: string) => {
    if (KeyListenerProcess) {
      KeyListenerProcess.stdin?.write(
        JSON.stringify({ command: 'unblock', key }) + '\n',
      )
    }
  })

  handleIPC('get-blocked-keys', () => {
    if (KeyListenerProcess) {
      KeyListenerProcess.stdin?.write(
        JSON.stringify({ command: 'get_blocked' }) + '\n',
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
    webContents.setZoomLevel(webContents.zoomLevel + 0.5),
  )
  handleIPC('web-zoom-out', () =>
    webContents.setZoomLevel(webContents.zoomLevel - 0.5),
  )
  handleIPC('web-toggle-fullscreen', () =>
    mainWindow.setFullScreen(!mainWindow.fullScreen),
  )
  handleIPC('web-open-url', (_e, url) => shell.openExternal(url))

  // Auth token exchange
  handleIPC('exchange-auth-code', async (_e, { authCode, state, config }) => {
    try {
      console.log('Exchanging auth code for tokens in main process')

      const authStore = store.get('auth')
      const codeVerifier = authStore.state?.codeVerifier
      const storedState = authStore.state?.state

      console.log('Code verifier:', codeVerifier)
      console.log('Stored state:', storedState)
      console.log('Received state:', state)
      console.log('Auth code:', authCode)
      console.log('Config:', config)

      // Validate state parameter
      if (storedState !== state) {
        throw new Error(`State mismatch: expected ${storedState}, got ${state}`)
      }

      if (!codeVerifier) {
        throw new Error('Code verifier not found in store')
      }

      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code: authCode,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
      })

      // Add audience if present in config
      if (config.audience) {
        tokenParams.append('audience', config.audience)
      }

      console.log('=== TOKEN EXCHANGE DEBUG ===')
      console.log('Request URL:', `https://${config.domain}/oauth/token`)
      console.log('Request method: POST')
      console.log('Content-Type: application/x-www-form-urlencoded')
      console.log('Request body:', tokenParams.toString())

      const response = await fetch(`https://${config.domain}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Token exchange failed:')
        console.error('Status:', response.status)
        console.error('Status Text:', response.statusText)
        console.error('Response:', errorText)
        console.error('Request params:', tokenParams.toString())

        throw new Error(
          `Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`,
        )
      }

      const tokens = await response.json()
      console.log('Successfully exchanged auth code for tokens')

      // Extract user info from ID token if available
      let userInfo: any = null
      if (tokens.id_token) {
        try {
          // Decode JWT payload (basic decode, no verification since it's from Auth0)
          const base64Payload = tokens.id_token.split('.')[1]
          const payload = JSON.parse(
            Buffer.from(base64Payload, 'base64').toString(),
          )
          userInfo = {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
            emailVerified: payload.email_verified,
          }
        } catch (jwtError) {
          console.warn('Failed to decode ID token:', jwtError)
        }
      }

      return {
        success: true,
        tokens,
        userInfo,
      }
    } catch (error) {
      console.error('Token exchange error in main process:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  // Accessibility permission check
  handleIPC(
    `check-accessibility-permission-${mainWindow.id}`,
    (_event, prompt: boolean = false) => {
      console.log(
        'check-accessibility-permission',
        systemPreferences.isTrustedAccessibilityClient(prompt),
      )
      return systemPreferences.isTrustedAccessibilityClient(prompt)
    },
  )

  // Microphone permission check
  handleIPC(
    `check-microphone-permission-${mainWindow.id}`,
    (_event, prompt: boolean = false) => {
      console.log('check-microphone-permission prompt', prompt)
      if (prompt) return systemPreferences.askForMediaAccess('microphone')
      console.log(
        'check-microphone-permission getMediaAccessStatus',
        systemPreferences.getMediaAccessStatus('microphone'),
      )
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

ipcMain.on('recording-state-changed', (_event, state: { isRecording: boolean; deviceId: string }) => {
  // Its ONLY job is to forward the state to the pill's renderer.
  getPillWindow()?.webContents.send('recording-state-update', state)
})

// Forwards volume data from the main window to the pill window
ipcMain.on('volume-update', (_event, volume: number) => {
  getPillWindow()?.webContents.send('volume-update', volume)
})
