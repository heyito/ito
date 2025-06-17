import { BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import os from 'os'

// Global key listener process singleton
export let KeyListenerProcess: ReturnType<typeof spawn> | null = null

// Initialize the key listener singleton
export const initializeKeyListener = (mainWindow: BrowserWindow) => {
  if (KeyListenerProcess) {
    return
  }

  const isDev = !app.isPackaged
  const platform = os.platform()
  const arch = os.arch()

  // Determine the binary name based on platform
  const binaryName =
    platform === 'win32' ? 'global-key-listener.exe' : 'global-key-listener'

  // Determine the target directory based on platform and architecture
  const getTargetDir = () => {
    if (isDev) {
      const targetBase = join(
        __dirname,
        '../../native/global-key-listener/target'
      )
      if (platform === 'darwin') {
        return arch === 'arm64'
          ? join(targetBase, 'aarch64-apple-darwin/release')
          : join(targetBase, 'x86_64-apple-darwin/release')
      } else if (platform === 'win32') {
        return join(targetBase, 'x86_64-pc-windows-gnu/release')
      }
    }
    // For production builds, binaries should be in the resources directory
    return join(process.resourcesPath, 'binaries')
  }

  const binaryPath = join(getTargetDir(), binaryName)

  try {
    // Set up environment variables
    const env = {
      ...process.env,
      RUST_BACKTRACE: '1', // Enable Rust backtraces
      OBJC_DISABLE_INITIALIZE_FORK_SAFETY: 'YES', // Fix macOS fork safety issues
    }

    // Spawn the process with detached: true to prevent it from being terminated when the parent exits
    KeyListenerProcess = spawn(binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      detached: true,
    })

    if (!KeyListenerProcess) {
      throw new Error('Failed to spawn process')
    }

    // Unref the process to allow the parent to exit independently
    KeyListenerProcess.unref()

    let buffer = ''
    KeyListenerProcess.stdout?.on('data', (data) => {
      const chunk = data.toString()
      buffer += chunk

      // Split on newlines and process complete events
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep the last incomplete line in the buffer
      for (const line of lines) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line)
            if (mainWindow.webContents.isDestroyed()) {
              console.warn('Window is destroyed, skipping key event')
              return
            }
            mainWindow.webContents.send('key-event', event)
          } catch (e) {
            console.error('Failed to parse key event:', e)
          }
        }
      }
    })

    KeyListenerProcess.stderr?.on('data', (data) => {
      console.error('Key listener stderr:', data.toString())
    })

    KeyListenerProcess.on('error', (error) => {
      console.error('Key listener process error:', error)
      KeyListenerProcess = null
    })

    KeyListenerProcess.on('close', (code, signal) => {
      console.warn(
        'Key listener process exited with code:',
        code,
        'signal:',
        signal
      )
      KeyListenerProcess = null
    })

    // Send a test command to verify the process is working
    setTimeout(() => {
      if (KeyListenerProcess) {
        KeyListenerProcess.stdin?.write(
          JSON.stringify({ command: 'get_blocked' }) + '\n'
        )
      }
    }, 1000)
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
