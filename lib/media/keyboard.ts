import { spawn } from 'child_process'
import store, { KeyboardShortcutConfig } from '../main/store'
import { STORE_KEYS } from '../constants/store-keys'
import { getNativeBinaryPath } from './native-interface'
import { BrowserWindow } from 'electron'
import { audioRecorderService } from './audio'
import { voiceInputService } from '../main/voiceInputService'
import { traceLogger } from '../main/traceLogger'

interface KeyEvent {
  type: 'keydown' | 'keyup'
  key: string
  timestamp: string
  raw_code: number
}

// Global key listener process singleton
export let KeyListenerProcess: ReturnType<typeof spawn> | null = null
export let isShortcutActive = false

// Test utility function - only available in development
export const resetForTesting = () => {
  if (process.env.NODE_ENV !== 'production') {
    KeyListenerProcess = null
    isShortcutActive = false
    pressedKeys.clear()
  }
}

const nativeModuleName = 'global-key-listener'

// Map of raw key names to their normalized representations
const keyNameMap: Record<string, string> = {
  MetaLeft: 'command',
  MetaRight: 'command',
  ControlLeft: 'control',
  ControlRight: 'control',
  Alt: 'option',
  AltGr: 'option',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  Function: 'fn',
  'Unknown(179)': 'fn_fast',
  KeyA: 'a',
  KeyB: 'b',
  KeyC: 'c',
  KeyD: 'd',
  KeyE: 'e',
  KeyF: 'f',
  KeyG: 'g',
  KeyH: 'h',
  KeyI: 'i',
  KeyJ: 'j',
  KeyK: 'k',
  KeyL: 'l',
  KeyM: 'm',
  KeyN: 'n',
  KeyO: 'o',
  KeyP: 'p',
  KeyQ: 'q',
  KeyR: 'r',
  KeyS: 's',
  KeyT: 't',
  KeyU: 'u',
  KeyV: 'v',
  KeyW: 'w',
  KeyX: 'x',
  KeyY: 'y',
  KeyZ: 'z',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
  Digit0: '0',
  Space: 'space',
  Enter: 'enter',
  Escape: 'esc',
  Backspace: 'backspace',
  Tab: 'tab',
  CapsLock: 'caps',
  Delete: 'delete',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

// Normalizes a raw key event into a consistent string
function normalizeKey(rawKey: string): string {
  return keyNameMap[rawKey] || rawKey.toLowerCase()
}

// This set will track the state of all currently pressed keys.
const pressedKeys = new Set<string>()

function handleKeyEventInMain(event: KeyEvent) {
  const { isShortcutGloballyEnabled, keyboardShortcuts } = store.get(
    STORE_KEYS.SETTINGS,
  )

  if (!isShortcutGloballyEnabled) {
    // check to see if we should stop an in-progress recording
    if (isShortcutActive) {
      // Shortcut released
      isShortcutActive = false
      console.info('Shortcut DEACTIVATED, stopping recording...')
      audioRecorderService.stopRecording()
    }
    return
  }

  const normalizedKey = normalizeKey(event.key)

  // Ignore the "fast fn" event which can be noisy.
  if (normalizedKey === 'fn_fast') return

  if (event.type === 'keydown') {
    pressedKeys.add(normalizedKey)
  } else {
    pressedKeys.delete(normalizedKey)
  }

  // Check if any of the configured shortcuts are currently held\
  const currentlyHeldShortcut = keyboardShortcuts.find(shortcut =>
    shortcut.keys.every(key => pressedKeys.has(key)),
  )

  // Only block keys when a complete shortcut is being held
  if (currentlyHeldShortcut) {
    // Block all keys for the currently held shortcut
    blockKeys(getKeysToBlock(currentlyHeldShortcut))
  } else {
    // Unblock all keys when no complete shortcut is pressed
    blockKeys([])
  }

  // Shortcut pressed
  if (currentlyHeldShortcut && !isShortcutActive) {
    isShortcutActive = true
    console.info('lib Shortcut ACTIVATED, starting recording...')

    // Start trace logging for new interaction
    const interactionId = traceLogger.startInteraction('HOTKEY_ACTIVATED', {
      shortcut: currentlyHeldShortcut.keys,
      mode: currentlyHeldShortcut.mode,
      pressedKeys: Array.from(pressedKeys),
      event: {
        type: event.type,
        key: event.key,
        normalizedKey,
        timestamp: event.timestamp,
      },
    })

    // Store interaction ID for later use
    ;(globalThis as any).currentInteractionId = interactionId

    voiceInputService.startSTTService(currentlyHeldShortcut.mode)
  } else if (!currentlyHeldShortcut && isShortcutActive) {
    // Shortcut released
    isShortcutActive = false
    console.info('lib Shortcut DEACTIVATED, stopping recording...')

    // Don't end the interaction yet - let the transcription service handle it
    // The interaction will be ended when transcription completes or fails
    voiceInputService.stopSTTService()
  }
}

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

            // 1. Process the event here in the main process for hotkey detection.
            handleKeyEventInMain(event)

            // 2. Continue to broadcast the raw event to all renderer windows for UI updates.
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

export const blockKeys = (keys: string[]) => {
  if (!KeyListenerProcess) {
    console.warn('Key listener not running, cannot block keys.')
    return
  }

  KeyListenerProcess.stdin?.write(
    JSON.stringify({ command: 'block', keys }) + '\n',
  )
}

export const unblockKey = (key: string) => {
  if (!KeyListenerProcess) {
    console.warn('Key listener not running, cannot unblock key.')
    return
  }
  KeyListenerProcess.stdin?.write(
    JSON.stringify({ command: 'unblock', key }) + '\n',
  )
}

/**
 * A reverse mapping of normalized key names to their raw `rdev` counterparts.
 * This is a one-to-many relationship (e.g., 'command' maps to ['MetaLeft', 'MetaRight']).
 */
const reverseKeyNameMap: Record<string, string[]> = Object.entries(
  keyNameMap,
).reduce(
  (acc, [rawKey, normalizedKey]) => {
    if (!acc[normalizedKey]) {
      acc[normalizedKey] = []
    }
    acc[normalizedKey].push(rawKey)
    return acc
  },
  {} as Record<string, string[]>,
)

const getKeysToBlock = (shortcut?: KeyboardShortcutConfig): string[] => {
  if (!shortcut) {
    return []
  }

  // Use the reverse map to find all raw keys for the normalized shortcut keys.
  const keys = shortcut.keys.flatMap(
    normalizedKey => reverseKeyNameMap[normalizedKey] || [],
  )

  // Also block the special "fast fn" key if fn is part of the shortcut.
  if (shortcut.keys.includes('fn')) {
    keys.push('Unknown(179)')
  }

  // Return a unique set of keys.
  return [...new Set(keys)]
}

export const stopKeyListener = () => {
  if (KeyListenerProcess) {
    // Clear the set on stop to prevent stuck keys if the app restarts.
    pressedKeys.clear()
    KeyListenerProcess.kill('SIGTERM')
    KeyListenerProcess = null
  }
}
