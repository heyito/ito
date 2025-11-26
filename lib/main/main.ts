import './env'
import './sentry'
import { app, protocol } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import {
  createAppWindow,
  createPillWindow,
  mainWindow,
  registerResourcesProtocol,
  startPillPositioner,
} from './app'
import { initializeLogging } from './logger'
import { registerIPC } from '../window/ipcEvents'
import { registerDevIPC } from '../window/ipcDev'
import { initializeDatabase } from './sqlite/db'
import { setupProtocolHandling, processStartupProtocolUrl } from '../protocol'
import { startKeyListener } from '../media/keyboard'
// Import the grpcClient singleton
import { grpcClient } from '../clients/grpcClient'
import { preventAppNap } from './appNap'
import { syncService } from './syncService'
import { checkAccessibilityPermission } from '../utils/crossPlatform'
import mainStore, { initializeStore } from './store'
import { STORE_KEYS } from '../constants/store-keys'
import { selectedTextReaderService } from '../media/selected-text-reader'
import { macOSAccessibilityContextProvider } from '../media/macOSAccessibilityContextProvider'
import { voiceInputService } from './voiceInputService'
import { initializeMicrophoneSelection } from '../media/microphoneSetUp'
import { validateStoredTokens, ensureValidTokens } from '../auth/events'
import { Auth0Config, validateAuth0Config } from '../auth/config'
import { createAppTray } from './tray'
import { initializeAutoUpdater } from './autoUpdaterWrapper'
import { teardown } from './teardown'
import { ITO_ENV } from './env'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'res',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
])

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Initialize the database BEFORE logging so KV writes have a schema
  try {
    await initializeDatabase()
  } catch (error) {
    console.error('Failed to initialize database, quitting app.', error)
    return
  }

  // Initialize KV-backed store and run migrations before anything reads/writes
  try {
    await initializeStore()
  } catch (err) {
    console.error('Failed to initialize main store, quitting app.', err)
    return
  }

  // Initialize logging after DB + store so batched log persistence can write
  initializeLogging()

  // Validate Auth0 configuration
  try {
    validateAuth0Config()
  } catch (error) {
    console.error('Auth0 configuration error:', error)
    console.warn(
      'Token refresh will be disabled due to missing Auth0 configuration',
    )
  }

  // Validate stored tokens before using them (will attempt refresh if needed)
  const tokensAreValid = await validateStoredTokens(Auth0Config)

  // If we have valid tokens from a previous session, start the sync service
  if (tokensAreValid) {
    const accessToken = mainStore.get(STORE_KEYS.ACCESS_TOKEN) as
      | string
      | undefined
    if (accessToken) {
      grpcClient.setAuthToken(accessToken)
    }
  }

  syncService.start()

  // Setup protocol handling for deep links
  setupProtocolHandling()

  // Prevent app nap
  preventAppNap()

  // Register the handler for the 'res' protocol now that the app is ready.
  const appId = ITO_ENV === 'prod' ? 'ai.ito.ito' : `ai.ito.ito-${ITO_ENV}`
  registerResourcesProtocol()
  electronApp.setAppUserModelId(appId)

  // IMPORTANT: Register IPC handlers BEFORE creating windows
  // This prevents the renderer from making IPC calls before handlers are ready
  registerIPC()

  if (!app.isPackaged) {
    registerDevIPC()
  }

  // Create windows
  createAppWindow()
  createPillWindow()
  startPillPositioner()

  // Handle protocol URL if the app was started by a deep link (Windows first instance)
  processStartupProtocolUrl()

  // --- ADDED: Give the gRPC client a reference to the main window ---
  // This allows it to send transcription results back to the renderer.
  if (mainWindow) {
    grpcClient.setMainWindow(mainWindow)
  }

  if (checkAccessibilityPermission(false)) {
    console.log('Accessibility permissions found, starting key listener.')
    startKeyListener()
  }

  console.log('Microphone access granted, starting audio recorder.')
  voiceInputService.setUpAudioRecorderListeners()

  console.log('Starting selected text reader service.')
  selectedTextReaderService.initialize()

  // Initialize cursor context provider (macOS only for now)
  if (process.platform === 'darwin') {
    console.log('Starting cursor context provider.')
    macOSAccessibilityContextProvider.initialize()
  }

  // Initialize microphone selection to prefer built-in microphone
  await initializeMicrophoneSelection()

  // Create system tray after audio recorder is initialized and devices are available
  await createAppTray()

  app.on('activate', function () {
    if (mainWindow === null) {
      createAppWindow()
      // Update the gRPC client with the new main window reference
      if (mainWindow) {
        grpcClient.setMainWindow(mainWindow)
      }
    }
  })

  app.on('before-quit', () => {
    console.log('App is quitting, cleaning up resources...')
    teardown()
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize auto-updater
  initializeAutoUpdater()

  // Set up periodic token refresh check (every 10 minutes)
  setInterval(
    async () => {
      try {
        await ensureValidTokens(Auth0Config)
      } catch (error) {
        console.error('Periodic token refresh failed:', error)
      }
    },
    10 * 60 * 1000,
  ) // Check every 10 minutes
})

app.on('window-all-closed', () => {
  // We want the app to stay alive
})
