import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { mainWindow } from './app'

export interface UpdateStatus {
  updateAvailable: boolean
  updateDownloaded: boolean
}

let updateStatus: UpdateStatus = {
  updateAvailable: false,
  updateDownloaded: false,
}

export function getUpdateStatus(): UpdateStatus {
  return { ...updateStatus }
}

export function initializeAutoUpdater() {
  // Initialize update status tracking
  updateStatus = {
    updateAvailable: false,
    updateDownloaded: false,
  }

  // Allow auto-updater in development mode if VITE_DEV_AUTO_UPDATE is set
  const enableDevUpdater = import.meta.env.VITE_DEV_AUTO_UPDATE === 'true'

  if (app.isPackaged || enableDevUpdater) {
    try {
      console.log(
        app.isPackaged
          ? 'App is packaged, initializing auto updater...'
          : 'Development auto-updater enabled, initializing...',
      )

      const bucket = import.meta.env.VITE_UPDATER_BUCKET
      if (!bucket) {
        throw new Error('VITE_UPDATER_BUCKET environment variable is not set')
      }

      // Force dev updates if in development mode
      if (!app.isPackaged) {
        autoUpdater.forceDevUpdateConfig = true
      }

      autoUpdater.setFeedURL({
        provider: 's3',
        bucket,
        path: 'releases/',
        region: 'us-west-2',
      })

      autoUpdater.autoRunAppAfterInstall = true

      setupAutoUpdaterEvents()
      autoUpdater.checkForUpdates()

      // Poll for updates every 10 minutes
      setInterval(
        () => {
          autoUpdater.checkForUpdates()
        },
        10 * 60 * 1000,
      )
    } catch (e) {
      console.error('Failed to check for auto updates:', e)
    }
  }
}

function setupAutoUpdaterEvents() {
  autoUpdater.on('update-available', () => {
    updateStatus.updateAvailable = true
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send('update-available')
    }
  })

  autoUpdater.on('update-downloaded', () => {
    console.log('update downloaded successfully')
    updateStatus.updateDownloaded = true
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send('update-downloaded')
    }
  })

  autoUpdater.on('error', error => {
    console.error('Auto updater error:', error)
  })

  autoUpdater.on('download-progress', progressObj => {
    const log_message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent.toFixed(2)}% (${progressObj.transferred}/${progressObj.total})`
    console.log(log_message)
  })
}
