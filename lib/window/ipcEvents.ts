import { type BrowserWindow, ipcMain, shell, systemPreferences } from 'electron'
import os from 'os'
import { spawn } from 'child_process'
import { join } from 'path'
import { app } from 'electron'

const handleIPC = (channel: string, handler: (...args: any[]) => void) => {
  ipcMain.handle(channel, handler)
}

// Global key listener process
let keyListenerProcess: ReturnType<typeof spawn> | null = null

export const registerWindowIPC = (mainWindow: BrowserWindow) => {
  // Hide the menu bar
  mainWindow.setMenuBarVisibility(false)

  // Start the global key listener
  const startKeyListener = () => {
    if (keyListenerProcess) {
      console.log('Key listener already running')
      return
    }

    const isDev = !app.isPackaged
    const binaryPath = isDev
      ? join(
          __dirname,
          '../../native/global-key-listener/target/release/global-key-listener'
        )
      : join(process.resourcesPath, 'global-key-listener')

    console.log('Starting key listener from:', binaryPath)

    try {
      // Set up environment variables
      const env = {
        ...process.env,
        RUST_BACKTRACE: '1', // Enable Rust backtraces
        OBJC_DISABLE_INITIALIZE_FORK_SAFETY: 'YES', // Fix macOS fork safety issues
      }

      // Spawn the process with detached: true to prevent it from being terminated when the parent exits
      keyListenerProcess = spawn(binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        detached: true,
      })

      if (!keyListenerProcess) {
        throw new Error('Failed to spawn process')
      }

      // Unref the process to allow the parent to exit independently
      keyListenerProcess.unref()

      let buffer = ''
      keyListenerProcess.stdout?.on('data', (data) => {
        const chunk = data.toString()
        buffer += chunk

        // Split on newlines and process complete events
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep the last incomplete line in the buffer
        console.log('Lines:', lines)
        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line)
              console.log('Sending key event to renderer:', event)
              mainWindow.webContents.send('key-event', event)
            } catch (e) {
              console.error('Failed to parse key event:', e)
            }
          }
        }
      })

      keyListenerProcess.stderr?.on('data', (data) => {
        console.error('Key listener stderr:', data.toString())
      })

      keyListenerProcess.on('error', (error) => {
        console.error('Key listener process error:', error)
        keyListenerProcess = null
      })

      keyListenerProcess.on('close', (code, signal) => {
        console.log(
          'Key listener process exited with code:',
          code,
          'signal:',
          signal
        )
        keyListenerProcess = null
      })

      // Send a test command to verify the process is working
      setTimeout(() => {
        if (keyListenerProcess) {
          console.log('Sending test command to key listener')
          keyListenerProcess.stdin?.write(
            JSON.stringify({ command: 'get_blocked' }) + '\n'
          )
        }
      }, 1000)
    } catch (error) {
      console.error('Failed to start key listener:', error)
      keyListenerProcess = null
    }
  }

  // Stop the global key listener
  const stopKeyListener = () => {
    if (keyListenerProcess) {
      console.log('Stopping key listener')
      // Send SIGTERM instead of SIGKILL to allow graceful shutdown
      keyListenerProcess.kill('SIGTERM')
      keyListenerProcess = null
    }
  }

  // Register key listener IPC
  handleIPC('start-key-listener', () => {
    startKeyListener()
    return true
  })

  handleIPC('stop-key-listener', () => {
    stopKeyListener()
    return true
  })

  handleIPC('block-keys', (_e, keys: string[]) => {
    if (keyListenerProcess) {
      console.log('Blocking keys:', keys)
      keyListenerProcess.stdin?.write(
        JSON.stringify({ command: 'block', keys }) + '\n'
      )
    }
  })

  handleIPC('unblock-key', (_e, key: string) => {
    if (keyListenerProcess) {
      console.log('Unblocking key:', key)
      keyListenerProcess.stdin?.write(
        JSON.stringify({ command: 'unblock', key }) + '\n'
      )
    }
  })

  handleIPC('get-blocked-keys', () => {
    if (keyListenerProcess) {
      console.log('Getting blocked keys')
      keyListenerProcess.stdin?.write(
        JSON.stringify({ command: 'get_blocked' }) + '\n'
      )
    }
  })

  // Register window IPC
  handleIPC('init-window', () => {
    const { width, height } = mainWindow.getBounds()
    const minimizable = mainWindow.isMinimizable()
    const maximizable = mainWindow.isMaximizable()
    const platform = os.platform()

    return { width, height, minimizable, maximizable, platform }
  })

  handleIPC('is-window-minimizable', () => mainWindow.isMinimizable())
  handleIPC('is-window-maximizable', () => mainWindow.isMaximizable())
  handleIPC('window-minimize', () => mainWindow.minimize())
  handleIPC('window-maximize', () => mainWindow.maximize())
  handleIPC('window-close', () => {
    stopKeyListener()
    mainWindow.close()
  })
  handleIPC('window-maximize-toggle', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  const webContents = mainWindow.webContents
  handleIPC('web-undo', () => webContents.undo())
  handleIPC('web-redo', () => webContents.redo())
  handleIPC('web-cut', () => webContents.cut())
  handleIPC('web-copy', () => webContents.copy())
  handleIPC('web-paste', () => webContents.paste())
  handleIPC('web-delete', () => webContents.delete())
  handleIPC('web-select-all', () => webContents.selectAll())
  handleIPC('web-reload', () => webContents.reload())
  handleIPC('web-force-reload', () => webContents.reloadIgnoringCache())
  handleIPC('web-toggle-devtools', () => webContents.toggleDevTools())
  handleIPC('web-actual-size', () => webContents.setZoomLevel(0))
  handleIPC('web-zoom-in', () =>
    webContents.setZoomLevel(webContents.zoomLevel + 0.5)
  )
  handleIPC('web-zoom-out', () =>
    webContents.setZoomLevel(webContents.zoomLevel - 0.5)
  )
  handleIPC('web-toggle-fullscreen', () =>
    mainWindow.setFullScreen(!mainWindow.fullScreen)
  )
  handleIPC('web-open-url', (_e, url) => shell.openExternal(url))
  // Accessibility permission check
  handleIPC(
    'check-accessibility-permission',
    (_event, prompt: boolean = false) => {
      return systemPreferences.isTrustedAccessibilityClient(prompt)
    }
  )

  // Microphone permission check
  handleIPC(
    'check-microphone-permission',
    (_event, prompt: boolean = false) => {
      if (prompt) return systemPreferences.askForMediaAccess('microphone')
      return systemPreferences.getMediaAccessStatus('microphone') === 'granted'
    }
  )
}
