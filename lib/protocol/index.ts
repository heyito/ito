import { app, BrowserWindow } from 'electron'
import { mainWindow } from '../main/app'

// Protocol handling for deep links
const PROTOCOL = 'ito'

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
        if (
          mainWindow &&
          !mainWindow.isDestroyed() &&
          !mainWindow.webContents.isDestroyed()
        ) {
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
        `Expected: ${PROTOCOL}: with hostname 'auth' and pathname '/callback'`,
      )
      console.warn(
        `Received: ${urlObj.protocol} with hostname '${urlObj.hostname}' and pathname '${urlObj.pathname}'`,
      )
    }
  } catch (error) {
    console.error('Error parsing protocol URL:', error)
  }
}

// Setup protocol handling
export function setupProtocolHandling(): void {
  // Register protocol handler
  if (!app.isDefaultProtocolClient(PROTOCOL)) {
    app.setAsDefaultProtocolClient(PROTOCOL)
  }

  // Handle protocol on Windows/Linux
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    app.quit()
    return
  }

  app.on('second-instance', (_event, commandLine, _workingDirectory) => {
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

  // Handle protocol on macOS
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolUrl(url)
  })
}

// Export the protocol name for use in other modules if needed
export { PROTOCOL }
