import { BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import os from 'os'

// Global key listener process singleton
export let KeyListenerProcess: ReturnType<typeof spawn> | null = null

// This function now just returns the configured path. It doesn't start anything.
function getBinaryPath(): string | null {
  const isDev = !app.isPackaged
  const platform = os.platform()
  
  const binaryName =
    platform === 'win32' ? 'global-key-listener.exe' : 'global-key-listener'

  const getTargetDir = () => {
    if (isDev) {
      const targetBase = join(__dirname, '../../native/global-key-listener/target')
      if (platform === 'darwin') {
        return join(targetBase, 'universal')
      } else if (platform === 'win32') {
        return join(targetBase, 'x86_64-pc-windows-gnu/release')
      }
      // Fallback for unsupported dev platforms
      return null
    }
    // For production builds
    return join(process.resourcesPath, 'binaries')
  }

  const targetDir = getTargetDir()
  if (!targetDir) {
    console.error(`Cannot determine key listener binary path for platform ${platform}`)
    return null
  }
  return join(targetDir, binaryName)
}

// Starts the key listener process
export const startKeyListener = () => {
  if (KeyListenerProcess) {
    console.warn('Key listener already running.')
    return
  }

  const binaryPath = getBinaryPath()
  if (!binaryPath) {
    console.error('Could not determine key listener binary path.')
    return
  }

  console.log('--- Key Listener Initialization ---')
  console.log(`Platform: ${os.platform()}, Arch: ${os.arch()}`)
  console.log(`Is Development: ${!app.isPackaged}`)
  console.log(`Attempting to spawn key listener at: ${binaryPath}`)

  try {
    const env = {
      ...process.env,
      RUST_BACKTRACE: '1',
      OBJC_DISABLE_INITIALIZE_FORK_SAFETY: 'YES',
    }

    KeyListenerProcess = spawn(binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      detached: true,
    })

    if (!KeyListenerProcess) {
      throw new Error('Failed to spawn process')
    }

    KeyListenerProcess.unref()

    let buffer = ''
    KeyListenerProcess.stdout?.on('data', (data) => {
      const chunk = data.toString()
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line)
            BrowserWindow.getAllWindows().forEach((window) => {
              if (!window.webContents.isDestroyed()) {
                window.webContents.send('key-event', event)
              }
            })
          } catch (e) {
            console.error('Failed to parse key event:', line, e)
          }
        }
      }
    })

    KeyListenerProcess.stderr?.on('data', (data) => {
      console.error('Key listener stderr:', data.toString())
    })

    KeyListenerProcess.on('error', (error) => {
      console.error('Key listener process spawn error:', error)
      KeyListenerProcess = null
    })

    KeyListenerProcess.on('close', (code, signal) => {
      console.warn(
        `Key listener process exited with code: ${code}, signal: ${signal}`
      )
      KeyListenerProcess = null
    })

    console.log('Key listener started successfully.')
  } catch (error) {
    console.error('Failed to start key listener:', error)
    KeyListenerProcess = null
  }
}

export const stopKeyListener = () => {
  if (KeyListenerProcess) {
    KeyListenerProcess.kill('SIGTERM')
    KeyListenerProcess = null
  }
}
