import { app, protocol, systemPreferences } from 'electron'
import { autoUpdater } from 'electron-updater'
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
import { audioRecorderService } from '../media/audio'
import { voiceInputService } from './voiceInputService'
import { initializeMicrophoneSelection } from '../media/microphoneSetUp'

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

  // If we have a token from a previous session, start the sync service
  const accessToken = mainStore.get('accessToken') as string | undefined
  if (accessToken) {
    grpcClient.setAuthToken(accessToken)
    syncService.start()
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

  // If the app is packaged, start the auto updater
  if (app.isPackaged) {
    try {
      console.log('App is packaged, initializing auto updater...')
      autoUpdater.setFeedURL({
        provider: 's3',
        bucket: 'dev-ito-releases', // TODO: Should come from env variable
        path: 'releases/',
        region: 'us-west-2',
      })

      autoUpdater.on('update-available', () => {
        mainWindow?.webContents.send('update-available')
      })

      autoUpdater.on('update-downloaded', () => {
        mainWindow?.webContents.send('update-downloaded')
      })

      autoUpdater.on('download-progress', progressObj => {
        const log_message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent.toFixed(2)}% (${progressObj.transferred}/${progressObj.total})`
        console.log(log_message)
      })

      autoUpdater.checkForUpdates()
    } catch (e) {
      console.error('Failed to check for auto updates:', e)
    }
  }

  if (!app.isPackaged) {
    registerDevIPC()
  }
})

app.on('window-all-closed', () => {
  // We want the app to stay alive
})
