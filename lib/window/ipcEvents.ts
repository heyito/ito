import { BrowserWindow, ipcMain, shell, app } from 'electron'
import log from 'electron-log'
import os from 'os'
import { exec } from 'child_process'
import store, { getCurrentUserId } from '../main/store'
import { STORE_KEYS } from '../constants/store-keys'
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
} from '../utils/crossPlatform'
import { getUpdateStatus, installUpdateNow } from '../main/autoUpdaterWrapper'

import {
  startKeyListener,
  KeyListenerProcess,
  stopKeyListener,
  registerAllHotkeys,
} from '../media/keyboard'
import { getPillWindow, mainWindow } from '../main/app'
import {
  generateNewAuthState,
  exchangeAuthCode,
  handleLogin,
  handleLogout,
  ensureValidTokens,
} from '../auth/events'
import { KeyValueStore } from '../main/sqlite/repo'
import { machineId } from 'node-machine-id'
import { Auth0Config, Auth0Connections } from '../auth/config'
import {
  NotesTable,
  DictionaryTable,
  InteractionsTable,
  UserMetadataTable,
} from '../main/sqlite/repo'
import { audioRecorderService } from '../media/audio'
import { voiceInputService } from '../main/voiceInputService'
import { itoSessionManager } from '../main/itoSessionManager'
import { ItoMode } from '@/app/generated/ito_pb'
import {
  getSelectedText,
  getSelectedTextString,
  hasSelectedText,
} from '../media/selected-text-reader'
import { IPC_EVENTS } from '../types/ipc'

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
    console.log('[IPC] Audio devices changed, notifying windows.')
    // Notify all windows to refresh their device lists in the UI.
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send(IPC_EVENTS.FORCE_DEVICE_LIST_RELOAD)
    }
    getPillWindow()?.webContents.send(IPC_EVENTS.FORCE_DEVICE_LIST_RELOAD)
  })

  ipcMain.on('install-update', async () => {
    await installUpdateNow()
  })

  ipcMain.handle('get-update-status', () => {
    return getUpdateStatus()
  })

  // Login Item Settings
  handleIPC('set-login-item-settings', (_e, enabled: boolean) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: false,
      })
      console.log(`Successfully set login item to: ${enabled}`)
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
        console.log(`Successfully set dock visibility to: ${visible}`)
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
  handleIPC('register-hotkeys', () => registerAllHotkeys())
  handleIPC('start-native-recording-service', () =>
    itoSessionManager.startSession(ItoMode.TRANSCRIBE),
  )
  handleIPC('stop-native-recording-service', () =>
    itoSessionManager.completeSession(),
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
    checkAccessibilityPermission(prompt),
  )
  handleIPC(
    'check-microphone-permission',
    async (_e, prompt: boolean = false) => {
      return checkMicrophonePermission(prompt)
    },
  )

  // Auth
  handleIPC('generate-new-auth-state', () => generateNewAuthState())
  handleIPC('exchange-auth-code', async (_e, { authCode, state, config }) =>
    exchangeAuthCode(_e, { authCode, state, config }),
  )
  handleIPC('logout', () => handleLogout())
  handleIPC(
    'notify-login-success',
    async (_e, { profile, idToken, accessToken }) => {
      handleLogin(profile, idToken, accessToken)
    },
  )

  // Start trial when onboarding completes
  handleIPC('start-trial-after-onboarding', async () => {
    try {
      const baseUrl = import.meta.env.VITE_GRPC_BASE_URL
      if (!baseUrl) {
        console.warn('[IPC] trial start skipped: VITE_GRPC_BASE_URL not set')
        return { success: false, error: 'VITE_GRPC_BASE_URL not set' }
      }

      const accessToken = store.get(STORE_KEYS.ACCESS_TOKEN) as string | null
      if (!accessToken) {
        console.warn('[IPC] trial start skipped: accessToken not available')
        return { success: false, error: 'Access token not available' }
      }

      const url = new URL('/trial/start', baseUrl)
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error')
        console.error(
          `[IPC] trial start failed: ${res.status} ${res.statusText}`,
          errorText,
        )
        return { success: false, error: errorText }
      }

      console.log('[IPC] trial start succeeded')
      // Notify renderer that trial started so it can refresh billing state
      if (
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.webContents.isDestroyed()
      ) {
        mainWindow.webContents.send('trial-started')
      }

      return { success: true }
    } catch (err: any) {
      console.error('[IPC] trial start failed:', err)
      return { success: false, error: err?.message || 'Unknown error' }
    }
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

  // Onboarding state (per user)
  handleIPC('get-onboarding-state', async () => {
    try {
      const userId = getCurrentUserId()
      if (!userId) return null
      const json = await KeyValueStore.get(`onboarding:${userId}`)
      return json ? JSON.parse(json) : null
    } catch (error) {
      log.error('[IPC] Failed to get onboarding state:', error)
      return null
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

  handleIPC('open-mailto', (_e, email: string) => {
    const mailtoUrl = `mailto:${email}`
    // On macOS, use the 'open' command which is more reliable for mailto links
    if (process.platform === 'darwin') {
      exec(`open "${mailtoUrl}"`, error => {
        if (error) {
          console.error('Failed to open mailto link:', error)
          // Fallback to shell.openExternal
          shell.openExternal(mailtoUrl)
        }
      })
    } else {
      // On other platforms, use shell.openExternal
      shell.openExternal(mailtoUrl)
    }
  })
  // Auth0 DB signup proxy (avoids CORS issues from custom schemes)
  handleIPC('auth0-db-signup', async (_e, { email, password, name }) => {
    try {
      const url = `https://${Auth0Config.domain}/dbconnections/signup`
      const payload: any = {
        client_id: Auth0Config.clientId,
        email,
        password,
        name,
        connection: Auth0Connections.database,
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      let data: any
      try {
        data = await res.json()
      } catch {
        data = undefined
      }
      if (!res.ok) {
        const message =
          data?.description ||
          data?.error ||
          `Auth0 signup failed (${res.status})`
        return { success: false, error: message, status: res.status }
      }
      console.log('[IPC] auth0-db-signup response', res.status, data)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error?.message || 'Network error' }
    }
  })

  // Auth0 DB login via Password Realm (Resource Owner Password) grant
  handleIPC('auth0-db-login', async (_e, { email, password }) => {
    try {
      if (!email || !password) {
        return { success: false, error: 'Missing email or password' }
      }
      const url = `https://${Auth0Config.domain}/oauth/token`
      const payload: any = {
        grant_type: 'http://auth0.com/oauth/grant-type/password-realm',
        client_id: Auth0Config.clientId,
        username: email,
        password,
        realm: Auth0Connections.database,
        scope: Auth0Config.scope,
      }
      if (Auth0Config.audience) {
        payload.audience = Auth0Config.audience
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      let data: any
      try {
        data = await res.json()
      } catch {
        data = undefined
      }
      if (!res.ok) {
        const message =
          data?.error_description ||
          data?.error ||
          `Auth0 login failed (${res.status})`
        return { success: false, error: message, status: res.status }
      }

      return {
        success: true,
        tokens: {
          id_token: data?.id_token || null,
          access_token: data?.access_token || null,
          refresh_token: data?.refresh_token || null,
          scope: data?.scope || null,
          expires_in: data?.expires_in || null,
          token_type: data?.token_type || null,
        },
      }
    } catch (error: any) {
      return { success: false, error: error?.message || 'Network error' }
    }
  })

  // Send verification email via server proxy
  handleIPC('auth0-send-verification', async (_e, { dbUserId }) => {
    try {
      if (!dbUserId) return { success: false, error: 'Missing user identifier' }
      const baseUrl = import.meta.env.VITE_GRPC_BASE_URL
      const token = (store.get(STORE_KEYS.ACCESS_TOKEN) as string | null) || ''
      const url = new URL('/auth0/send-verification', baseUrl)
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ dbUserId, clientId: Auth0Config.clientId }),
      })
      const data: any = await res.json().catch(() => undefined)
      if (!res.ok) {
        return {
          success: false,
          error: data?.error || `Verification request failed (${res.status})`,
          status: res.status,
        }
      }
      return data
    } catch (error: any) {
      return { success: false, error: error?.message || 'Network error' }
    }
  })

  // Check if email exists for db signup and whether it's verified (via server proxy)
  handleIPC('auth0-check-email', async (_e, { email }) => {
    try {
      if (!email) return { success: false, error: 'Missing email' }
      const baseUrl = import.meta.env.VITE_GRPC_BASE_URL
      const token = (store.get(STORE_KEYS.ACCESS_TOKEN) as string | null) || ''
      const url = new URL(
        `/auth0/users-by-email?email=${encodeURIComponent(email)}`,
        baseUrl,
      )
      const res = await fetch(url.toString(), {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data: any = await res.json().catch(() => undefined)
      if (!res.ok) {
        return {
          success: false,
          error: data?.error || `Lookup failed (${res.status})`,
          status: res.status,
        }
      }
      return data
    } catch (error: any) {
      return { success: false, error: error?.message || 'Network error' }
    }
  })

  // Trial routes proxy
  handleIPC('trial:complete', async () => {
    try {
      const baseUrl = import.meta.env.VITE_GRPC_BASE_URL
      const token = (store.get(STORE_KEYS.ACCESS_TOKEN) as string | null) || ''
      const url = new URL('/trial/complete', baseUrl)
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data: any = await res.json().catch(() => undefined)
      if (!res.ok) {
        return {
          success: false,
          error: data?.error || `Trial complete failed (${res.status})`,
          status: res.status,
        }
      }
      return data
    } catch (error: any) {
      return { success: false, error: error?.message || 'Network error' }
    }
  })

  // Billing routes proxy
  handleIPC('billing:create-checkout-session', async () => {
    try {
      const baseUrl = import.meta.env.VITE_GRPC_BASE_URL
      const token = (store.get(STORE_KEYS.ACCESS_TOKEN) as string | null) || ''
      const url = new URL('/billing/checkout', baseUrl)
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data: any = await res.json().catch(() => undefined)
      if (!res.ok) {
        return {
          success: false,
          error: data?.error || `Checkout create failed (${res.status})`,
          status: res.status,
        }
      }
      return data
    } catch (error: any) {
      return { success: false, error: error?.message || 'Network error' }
    }
  })

  handleIPC(
    'billing:confirm-session',
    async (_e, { sessionId }: { sessionId: string }) => {
      try {
        const baseUrl = import.meta.env.VITE_GRPC_BASE_URL
        const token =
          (store.get(STORE_KEYS.ACCESS_TOKEN) as string | null) || ''
        const url = new URL('/billing/confirm', baseUrl)
        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ session_id: sessionId }),
        })
        const data: any = await res.json().catch(() => undefined)
        if (!res.ok) {
          return {
            success: false,
            error: data?.error || `Confirm failed (${res.status})`,
            status: res.status,
          }
        }
        return data
      } catch (error: any) {
        return { success: false, error: error?.message || 'Network error' }
      }
    },
  )

  handleIPC('billing:status', async () => {
    try {
      const baseUrl = import.meta.env.VITE_GRPC_BASE_URL
      const token = (store.get(STORE_KEYS.ACCESS_TOKEN) as string | null) || ''
      const url = new URL('/billing/status', baseUrl)
      const res = await fetch(url.toString(), {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data: any = await res.json().catch(() => undefined)
      if (!res.ok) {
        return {
          success: false,
          error: data?.error || `Status failed (${res.status})`,
          status: res.status,
        }
      }
      return data
    } catch (error: any) {
      return { success: false, error: error?.message || 'Network error' }
    }
  })

  handleIPC('billing:cancel-subscription', async () => {
    try {
      const baseUrl = import.meta.env.VITE_GRPC_BASE_URL
      const token = (store.get(STORE_KEYS.ACCESS_TOKEN) as string | null) || ''
      const url = new URL('/billing/cancel', baseUrl)
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data: any = await res.json().catch(() => undefined)
      if (!res.ok) {
        return {
          success: false,
          error: data?.error || `Cancel failed (${res.status})`,
          status: res.status,
        }
      }
      return data
    } catch (error: any) {
      return { success: false, error: error?.message || 'Network error' }
    }
  })
  handleIPC('open-auth-window', async (_e, { url, redirectUri }) => {
    try {
      if (!url || !redirectUri)
        return { success: false, error: 'Missing url or redirectUri' }

      const win = new BrowserWindow({
        parent: mainWindow ?? undefined,
        modal: true,
        width: 480,
        height: 720,
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      })

      const maybeHandleRedirect = (event: Electron.Event, navUrl: string) => {
        try {
          if (!navUrl || !navUrl.startsWith(redirectUri)) return
          event.preventDefault()
          const u = new URL(navUrl)
          const code = u.searchParams.get('code') || ''
          const state = u.searchParams.get('state') || ''
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('auth-code-received', code, state)
          }
          if (!win.isDestroyed()) win.close()
        } catch (err) {
          console.error('[IPC] open-auth-window redirect parse error:', err)
        }
      }

      win.webContents.on('will-redirect', maybeHandleRedirect)
      win.webContents.on('will-navigate', maybeHandleRedirect)

      await win.loadURL(url)
      return { success: true }
    } catch (error: any) {
      console.error('[IPC] open-auth-window error:', error)
      return { success: false, error: error?.message || 'Unknown error' }
    }
  })
  handleIPC('get-native-audio-devices', async () => {
    console.log(
      '[IPC] Received get-native-audio-devices, calling requestDeviceListPromise...',
    )
    return audioRecorderService.getDeviceList()
  })

  // Platform info
  handleIPC('get-platform', () => {
    // Allow overriding platform for testing cross-platform UI behavior
    const overridePlatform = import.meta.env.VITE_OVERRIDE_PLATFORM
    if (overridePlatform) {
      log.info(
        `[Platform] Using override: ${overridePlatform} (actual: ${process.platform})`,
      )
      return overridePlatform as NodeJS.Platform
    }
    return process.platform
  })

  // Selected Text Reader
  handleIPC('get-selected-text', async (_e, options) => {
    console.log('[IPC] Received get-selected-text with options:', options)
    return getSelectedText(options)
  })
  handleIPC('get-selected-text-string', async (_e, maxLength) => {
    console.log('[IPC] Received get-selected-text-string')
    return getSelectedTextString(maxLength)
  })
  handleIPC('has-selected-text', async () => {
    console.log('[IPC] Received has-selected-text')
    return hasSelectedText()
  })

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
  handleIPC('dictionary:add', async (_e, item) => {
    return await DictionaryTable.insert(item)
  })
  handleIPC('dictionary:update', async (_e, { id, word, pronunciation }) => {
    return await DictionaryTable.update(id, word, pronunciation)
  })
  handleIPC('dictionary:delete', async (_e, id) =>
    DictionaryTable.softDelete(id),
  )

  // User Metadata
  handleIPC('user-metadata:get', async () => {
    const user_id = getCurrentUserId()
    if (!user_id) return null
    return UserMetadataTable.findByUserId(user_id)
  })
  handleIPC('user-metadata:upsert', async (_e, metadata) => {
    return await UserMetadataTable.upsert(metadata)
  })
  handleIPC('user-metadata:update', async (_e, updates) => {
    const user_id = getCurrentUserId()
    if (!user_id) throw new Error('No user ID found')
    return await UserMetadataTable.update(user_id, updates)
  })

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

  handleIPC('update-advanced-settings', async (_e, advancedSettings) => {
    console.log('Updating advanced settings:', advancedSettings)
    const { grpcClient } = await import('../clients/grpcClient')
    const result = await grpcClient.updateAdvancedSettings(advancedSettings)
    return result
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
    console.log(`IPC: Received 'start-native-recording'`)
    itoSessionManager.startSession(ItoMode.TRANSCRIBE)
  })

  ipcMain.on('start-native-recording-test', _event => {
    console.log(`IPC: Received 'start-native-recording-test'`)
    const deviceId = store.get(STORE_KEYS.SETTINGS).microphoneDeviceId
    audioRecorderService.startRecording(deviceId)
  })

  // When the hotkey is released, stop recording and notify the pill window.
  ipcMain.on('stop-native-recording', () => {
    console.log('IPC: Received stop-native-recording.')
    itoSessionManager.completeSession()
  })

  // Stop recording for microphone test (doesn't stop transcription since it wasn't started)
  ipcMain.on('stop-native-recording-test', () => {
    console.log('IPC: Received stop-native-recording-test.')
    audioRecorderService.stopRecording()
  })

  // Analytics Device ID storage - using machine ID
  handleIPC('analytics:get-device-id', async () => {
    try {
      // First try to get cached device ID from SQLite
      let deviceId = await KeyValueStore.get('analytics_device_id')

      if (!deviceId) {
        // Generate machine-specific ID if none exists
        deviceId = await machineId()
        await KeyValueStore.set('analytics_device_id', deviceId)
        console.log(
          '[Analytics] Generated new machine-based device ID:',
          deviceId,
        )
      }

      return deviceId
    } catch (error) {
      log.error('[Analytics] Failed to get/generate device ID:', error)
      // Fallback to basic machine id without caching
      try {
        return await machineId()
      } catch (fallbackError) {
        log.error('[Analytics] Machine ID fallback failed:', fallbackError)
        return undefined
      }
    }
  })

  // Resolve and clear install link token
  handleIPC('analytics:resolve-install-token', async () => {
    try {
      const url = new URL(`/link/resolve`, import.meta.env.VITE_GRPC_BASE_URL)
      const res = await fetch(url.toString(), {
        headers: { 'content-type': 'application/json' },
      })
      const data: any = await res.json().catch(() => undefined)
      if (!res.ok) {
        return {
          success: false,
          error: data?.error || `Resolve failed (${res.status})`,
          status: res.status,
        }
      }
      return {
        success: true,
        websiteDistinctId: data?.websiteDistinctId || null,
      }
    } catch (error: any) {
      return { success: false, error: error?.message || 'Unknown error' }
    }
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
      return checkAccessibilityPermission(prompt)
    },
  )

  // Microphone permission check
  handleIPC(
    `check-microphone-permission-${mainWindow.id}`,
    async (_event, prompt: boolean = false) => {
      console.log('check-microphone-permission prompt', prompt)
      const res = await checkMicrophonePermission(prompt)
      console.log('check-microphone-permission result', res)
      return res
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
ipcMain.on(IPC_EVENTS.VOLUME_UPDATE, (_event, volume: number) => {
  getPillWindow()?.webContents.send(IPC_EVENTS.VOLUME_UPDATE, volume)
})

// Forwards settings updates from the main window to the pill window
ipcMain.on(IPC_EVENTS.SETTINGS_UPDATE, (_event, settings: any) => {
  getPillWindow()?.webContents.send(IPC_EVENTS.SETTINGS_UPDATE, settings)

  // If microphone selection changed, ensure audio config is set
  if (settings && typeof settings.microphoneDeviceId === 'string') {
    // Ask the recorder for the effective output config for the selected mic
    voiceInputService.handleMicrophoneChanged(settings.microphoneDeviceId)
  }
})

// Persist onboarding updates per-user and forward to the pill window
ipcMain.on(IPC_EVENTS.ONBOARDING_UPDATE, async (_event, onboarding: any) => {
  try {
    const userId = getCurrentUserId()
    if (userId && onboarding) {
      const payload = {
        onboardingStep: onboarding.onboardingStep,
        onboardingCompleted: onboarding.onboardingCompleted,
      }
      await KeyValueStore.set(`onboarding:${userId}`, JSON.stringify(payload))
    }
  } catch (error) {
    log.error('[IPC] Failed to persist onboarding update:', error)
  }

  getPillWindow()?.webContents.send(IPC_EVENTS.ONBOARDING_UPDATE, onboarding)
})

// Forwards user authentication updates from the main window to the pill window
ipcMain.on(IPC_EVENTS.USER_AUTH_UPDATE, (_event, authUser: any) => {
  getPillWindow()?.webContents.send(IPC_EVENTS.USER_AUTH_UPDATE, authUser)
})
