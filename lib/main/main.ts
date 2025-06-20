import { app, BrowserWindow, protocol, systemPreferences } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import {
  createAppWindow,
  createPillWindow,
  startPillPositioner,
  getMainWindow,
} from './app'
import { initializeLogging } from './logger'
import { registerIPC } from '../window/ipcEvents'
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

// Protocol handling for deep links
const PROTOCOL = 'ito'

// Handle protocol on Windows/Linux
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window instead
    const mainWindow = BrowserWindow.getAllWindows().find(
      win => !win.isDestroyed(),
    )
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }

    // Handle protocol URL on Windows/Linux
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL}://`))
    if (url) {
      handleProtocolUrl(url)
    }
  })
}

// Handle protocol URL
function handleProtocolUrl(url: string) {
  try {
    const urlObj = new URL(url)

    if (
      urlObj.protocol === `${PROTOCOL}:` &&
      urlObj.hostname === 'auth' &&
      urlObj.pathname === '/callback'
    ) {
      const authCode = urlObj.searchParams.get('code')
      const state = urlObj.searchParams.get('state')

      if (authCode && state) {
        // Find the main window (not the pill window) and send the auth code
        const mainWindow = getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auth-code-received', authCode, state)

          // Focus and show the window with more aggressive methods
          mainWindow.show()
          mainWindow.focus()
          mainWindow.setAlwaysOnTop(true)
          mainWindow.setAlwaysOnTop(false)

          // On macOS, use additional methods to force focus
          if (process.platform === 'darwin') {
            mainWindow.moveTop()
            app.focus({ steal: true })
            app.dock?.show()
          }
        } else {
          console.error('No main window found to send auth code to')
        }
      } else {
        console.warn('No auth code found in protocol URL')
      }
    } else {
      console.warn('Protocol URL does not match expected format')
      console.warn(
        `Expected: ${PROTOCOL}: with hostname 'auth' and pathname '/success'`,
      )
      console.warn(
        `Received: ${urlObj.protocol} with hostname '${urlObj.hostname}' and pathname '${urlObj.pathname}'`,
      )
    }
  } catch (error) {
    console.error('Error parsing protocol URL:', error)
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Initialize logging as the first step
  initializeLogging()

  // Register protocol handler
  if (!app.isDefaultProtocolClient(PROTOCOL)) {
    // Define the path to the executable
    app.setAsDefaultProtocolClient(PROTOCOL)
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  
  // Create windows
  createAppWindow()
  createPillWindow()
  startPillPositioner()

  // Start the key listener if we have permissions.
  if (systemPreferences.isTrustedAccessibilityClient(false)) {
    console.log('Accessibility permissions found, starting key listener.')
    startKeyListener()
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
      createAppWindow()
    }
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIPC()
})

// Handle protocol on macOS
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleProtocolUrl(url)
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // We want the app to stay alive so the pill window can function
  // if (process.platform !== 'darwin') {
  //   app.quit()
  // }
})

// In this file, you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
