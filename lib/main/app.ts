import { BrowserWindow, shell, screen, app, protocol, net } from 'electron'
import { join } from 'path'
import appIcon from '@/resources/build/icon.png?asset'
import { pathToFileURL } from 'url'

// Keep a reference to the pill window to prevent it from being garbage collected.
let pillWindow: BrowserWindow | null = null
// Keep a reference to the main window
export let mainWindow: BrowserWindow | null = null

export function getPillWindow(): BrowserWindow | null {
  return pillWindow
}

// --- No changes to createAppWindow ---
export function createAppWindow(): BrowserWindow {
  // Create the main window.
  mainWindow = new BrowserWindow({
    width: 1270,
    height: 800,
    show: false,
    backgroundColor: '#ffffff',
    icon: appIcon,
    frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 17 },
    title: 'Ito',
    maximizable: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      webSecurity: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler(details => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: res:; " +
              "media-src 'self' blob:;",
          ],
        },
      })
    },
  )

  // Clean up the reference when the window is closed.
  mainWindow.on('closed', () => {
    mainWindow = null
    // On Windows, closing the main window should quit the entire app
    if (process.platform === 'win32') {
      app.quit()
    }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

const PILL_MAX_WIDTH = 172
const PILL_MAX_HEIGHT = 84
export function createPillWindow(): void {
  pillWindow = new BrowserWindow({
    width: PILL_MAX_WIDTH,
    height: PILL_MAX_HEIGHT,
    show: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true, // Keep on top
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    focusable: false, // Prevents window from stealing focus
    hasShadow: false,
    type: 'panel',
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
    },
    hiddenInMissionControl: true,
  })

  pillWindow.setIgnoreMouseEvents(true, { forward: true })

  // Set properties for macOS to ensure it stays on top of full-screen apps
  if (process.platform === 'darwin') {
    pillWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    pillWindow.setFullScreenable(false)

    pillWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    })
  }

  // Use a URL hash to tell our React app to load the pill component.
  const pillUrl =
    !app.isPackaged && process.env['ELECTRON_RENDERER_URL']
      ? `${process.env['ELECTRON_RENDERER_URL']}/#/pill`
      : `${pathToFileURL(join(__dirname, '../renderer/index.html'))}#/pill`

  pillWindow.loadURL(pillUrl)

  // Uncomment the next line to open the DevTools for debugging the pill window.
  // This is useful during development to inspect the pill's UI and behavior.
  // pillWindow.webContents.openDevTools({ mode: 'detach' })

  // Clean up the reference when the window is closed.
  pillWindow.on('closed', () => {
    pillWindow = null
  })
}

export function startPillPositioner() {
  // Listen for display changes to handle dock visibility changes
  screen.on('display-metrics-changed', () => {
    updatePillPosition()
  })

  // Initial position on start
  updatePillPosition()

  // Throttle updates (Windows needs less frequent updates to avoid jitter)
  const intervalMs = process.platform === 'win32' ? 750 : 250
  setInterval(updatePillPosition, intervalMs)
}

function updatePillPosition() {
  if (!pillWindow) return

  try {
    // Get the display that the mouse cursor is currently on.
    const point = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(point)
    const { width: pillWidth, height: pillHeight } = pillWindow.getBounds()

    // Use workArea instead of bounds to account for dock/menu bar
    const { x, y, width, height } = display.workArea
    const screenBounds = display.bounds

    const scale = display.scaleFactor || 1
    const roundToDeviceDip = (v: number) =>
      Math.round(Math.round(v * scale) / scale)

    // Calculate position: Horizontally centered, positioned above taskbar
    const newX = roundToDeviceDip(x + width / 2 - pillWidth / 2)

    // Position just above the work area bottom
    const newY = roundToDeviceDip(y + height - pillHeight - 10)

    // Ensure we don't go below the screen bounds
    const maxY = screenBounds.y + screenBounds.height - pillHeight - 10
    const finalY = Math.min(newY, maxY)

    // Only move if position actually changed (>= 1 DIP)
    const [currX, currY] = pillWindow.getPosition()
    if (Math.abs(currX - newX) < 1 && Math.abs(currY - finalY) < 1) {
      return
    }

    // Set the position of the pill window.
    pillWindow.setPosition(newX, finalY, false) // `false` = not animated
  } catch (error) {
    // This can fail if the app is starting up or shutting down.
    console.warn('Could not update pill position:', error)
  }
}

// --- No changes to other functions ---
export function registerResourcesProtocol() {
  protocol.handle('res', async request => {
    try {
      const url = new URL(request.url)
      // Combine hostname and pathname to get the full path
      const fullPath = join(url.hostname, url.pathname.slice(1))
      const filePath = join(__dirname, '../../resources', fullPath)
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (error) {
      console.error('Protocol error:', error)
      return new Response('Resource not found', { status: 404 })
    }
  })
}
