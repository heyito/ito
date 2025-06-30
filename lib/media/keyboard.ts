import { BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { app } from 'electron'
import os from 'os'
import { getNativeBinaryPath } from './native-interface'

// Global key listener process singleton
export let KeyListenerProcess: ReturnType<typeof spawn> | null = null

const nativeModuleName = 'global-key-listener'

// Starts the key listener process
export const startKeyListener = () => {
  if (KeyListenerProcess) {
    console.warn('Key listener already running.')
    return
  }

  const binaryPath = getNativeBinaryPath(nativeModuleName)
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
    KeyListenerProcess.stdout?.on('data', data => {
      const chunk = data.toString()
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line)
            BrowserWindow.getAllWindows().forEach(window => {
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

    KeyListenerProcess.stderr?.on('data', data => {
      console.error('Key listener stderr:', data.toString())
    })

    KeyListenerProcess.on('error', error => {
      console.error('Key listener process spawn error:', error)
      KeyListenerProcess = null
    })

    KeyListenerProcess.on('close', (code, signal) => {
      console.warn(
        `Key listener process exited with code: ${code}, signal: ${signal}`,
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
