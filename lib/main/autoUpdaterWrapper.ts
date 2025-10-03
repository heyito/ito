import { app } from 'electron'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
import { mainWindow } from './app'
import { exec } from 'child_process'
import { teardown } from './tearDown'

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

      log.transports.file.level = 'debug'
      autoUpdater.logger = log

      autoUpdater.autoRunAppAfterInstall = true
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = false

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

const WIN_HELPERS = [
  'Ito.exe', // belt + suspenders
  'global-key-listener.exe',
  'audio-recorder.exe',
  'text-writer.exe',
  'active-application.exe',
  'selected-text-reader.exe',
  'electron-crashpad-handler.exe',
]

const MAC_HELPERS = [
  'global-key-listener',
  'audio-recorder',
  'text-writer',
  'active-application',
  'selected-text-reader',
  'electron-crashpad-handler',
  // Electron’s helpers (your app name may differ)
  'Ito Helper',
  'Ito Helper (Renderer)',
  'Ito Helper (GPU)',
  'Ito Helper (Plugin)',
]

function killByName(name: string): Promise<void> {
  return new Promise(resolve => {
    const cmd =
      process.platform === 'win32'
        ? `taskkill /IM "${name}" /T /F`
        : `pkill -f "${name}" || true`
    exec(cmd, () => resolve())
  })
}

async function hardKillAll(): Promise<void> {
  const names = process.platform === 'win32' ? WIN_HELPERS : MAC_HELPERS
  for (const n of names) {
    try {
      await killByName(n)
    } catch {
      /* empty */
    }
  }
  // tiny grace window for handle release
  await new Promise(r => setTimeout(r, 500))
}

let installing = false

export async function installUpdateNow() {
  if (installing) return
  installing = true
  log.info('[Updater] Preparing to install…')

  try {
    // Try to gracefully shut down processes
    teardown()
    await new Promise(resolve => setTimeout(resolve, 5_000))

    // Force-kill stragglers + crashpad/helpers
    await hardKillAll()

    // Fire the installer (UI visible for debugging recommended)
    autoUpdater.quitAndInstall(false /* isSilent */, true /* forceRunAfter */)
  } catch (e) {
    log.error('[Updater] installUpdateNow error', e)
    // Try again, but don’t loop forever
    try {
      await hardKillAll()
      autoUpdater.quitAndInstall(false, true)
    } catch {
      /* empty */
    }
  }
}
