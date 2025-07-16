import { app, protocol, systemPreferences } from 'electron'
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
import { setupProtocolHandling } from '../protocol'
import { startKeyListener, stopKeyListener } from '../media/keyboard'
// Import the grpcClient singleton
import { grpcClient } from '../clients/grpcClient'
import { allowAppNap, preventAppNap } from './appNap'
import { syncService } from './syncService'
import mainStore from './store'
import { STORE_KEYS } from '../constants/store-keys'
import { audioRecorderService } from '../media/audio'
import { voiceInputService } from './voiceInputService'
import { initializeMicrophoneSelection } from '../media/microphoneSetUp'
import { validateStoredTokens, ensureValidTokens } from '../auth/events'
import { Auth0Config, validateAuth0Config } from '../auth/config'

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
  // Initialize logging as the first step
  initializeLogging()

  // Initialize the database
  try {
    await initializeDatabase()
  } catch (error) {
    console.error('Failed to initialize database, quitting app.', error)
    return
  }

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
      syncService.start()
    }
  }

  // Setup protocol handling for deep links
  setupProtocolHandling()

  // Prevent app nap
  preventAppNap()

  // Register the handler for the 'res' protocol now that the app is ready.
  registerResourcesProtocol()
  electronApp.setAppUserModelId('com.electron')

  // Create windows
  createAppWindow()
  createPillWindow()
  startPillPositioner()

  // --- ADDED: Give the gRPC client a reference to the main window ---
  // This allows it to send transcription results back to the renderer.
  if (mainWindow) {
    grpcClient.setMainWindow(mainWindow)
  }

  if (systemPreferences.isTrustedAccessibilityClient(false)) {
    console.log('Accessibility permissions found, starting key listener.')
    startKeyListener()
  }

  console.log('Microphone access granted, starting audio recorder.')
  voiceInputService.setUpAudioRecorderListeners()

  // Initialize microphone selection to prefer built-in microphone
  await initializeMicrophoneSelection()

  app.on('activate', function () {
    if (mainWindow === null) {
      createAppWindow()
    }
  })

  app.on('before-quit', () => {
    console.log('App is quitting, cleaning up resources...')
    stopKeyListener()
    audioRecorderService.terminate()
    allowAppNap()
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIPC()

  if (!app.isPackaged) {
    registerDevIPC()
  }

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
