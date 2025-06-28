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
import { startAudioRecorder, stopAudioRecorder } from '../media/audio'
// Import the grpcClient singleton
import { grpcClient } from '../clients/grpcClient'
import { allowAppNap, preventAppNap } from './appNap'

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
    // app.quit()
    // return
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

  startAudioRecorder()

  if (systemPreferences.isTrustedAccessibilityClient(false)) {
    console.log('Accessibility permissions found, starting key listener.')
    startKeyListener()
  }

  app.on('activate', function () {
    if (mainWindow === null) {
      createAppWindow()
    }
  })

  app.on('before-quit', () => {
    console.log('App is quitting, cleaning up resources...')
    stopKeyListener()
    stopAudioRecorder()
    allowAppNap()
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIPC()

  if (!app.isPackaged) {
    registerDevIPC()
  }
})

app.on('window-all-closed', () => {
  // We want the app to stay alive
})
