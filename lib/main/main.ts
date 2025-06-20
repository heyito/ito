import { app, BrowserWindow, protocol, systemPreferences } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import {
  createAppWindow,
  createPillWindow,
  registerResourcesProtocol,
  startPillPositioner,
} from './app'
import { initializeLogging } from './logger'
import { startKeyListener } from '../media/keyboard'

// Register the custom 'res' protocol and mark it as privileged.
// This must be done before the app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'res',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
])

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Initialize logging as the first step
  initializeLogging()

  // Register the handler for the 'res' protocol now that the app is ready.
  registerResourcesProtocol()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  
  // Create windows
  const mainWindow = createAppWindow()
  createPillWindow()
  startPillPositioner()

  // Start key listener if we already have permissions
  if (systemPreferences.isTrustedAccessibilityClient(false)) {
    console.log('Accessibility permissions already granted. Starting key listener.')
    startKeyListener(mainWindow)
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createAppWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file, you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
