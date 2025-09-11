import { spawn } from 'child_process'
import store, { KeyboardShortcutConfig } from '../main/store'
import { STORE_KEYS } from '../constants/store-keys'
import { getNativeBinaryPath } from './native-interface'
import { BrowserWindow } from 'electron'
import { audioRecorderService } from './audio'
import { voiceInputService } from '../main/voiceInputService'
import { traceLogger } from '../main/traceLogger'
import { KeyName, keyNameMap, normalizeLegacyKey } from '../types/keyboard'

interface KeyEvent {
  type: 'keydown' | 'keyup'
  key: string
  timestamp: string
  raw_code: number
}

// Global key listener process singleton
export let KeyListenerProcess: ReturnType<typeof spawn> | null = null
export let isShortcutActive = false

// Debouncing state
let shortcutDebounceTimeout: NodeJS.Timeout | null = null
let pendingShortcut: KeyboardShortcutConfig | null = null
export const DEBOUNCE_TIME = 10

// Test utility function - only available in development
export const resetForTesting = () => {
  if (process.env.NODE_ENV !== 'production') {
    KeyListenerProcess = null
    isShortcutActive = false
    pressedKeys.clear()
    keyPressTimestamps.clear()
    stopStuckKeyChecker()
    if (shortcutDebounceTimeout) {
      clearTimeout(shortcutDebounceTimeout)
      shortcutDebounceTimeout = null
    }
    pendingShortcut = null
  }
}

const nativeModuleName = 'global-key-listener'

// Normalizes a raw key event into a consistent string
function normalizeKey(rawKey: string): KeyName {
  return keyNameMap[rawKey] || rawKey.toLowerCase()
}

// Export the key name mapping for use in UI components
export { keyNameMap }

// This set will track the state of all currently pressed keys.
const pressedKeys = new Set<string>()

// Track when each key was first pressed to detect stuck keys
const keyPressTimestamps = new Map<KeyName, number>()

// Timer for checking stuck keys
let stuckKeyCheckTimer: NodeJS.Timeout | null = null

// Configuration for stuck key detection
const STUCK_KEY_TIMEOUT = 5000 // 5 seconds
const STUCK_KEY_CHECK_INTERVAL = 1000 // Check every 1 second

// Function to check for and remove stuck keys
function checkForStuckKeys() {
  const currentTime = Date.now()
  const stuckKeys: KeyName[] = []

  for (const [key, pressTime] of keyPressTimestamps) {
    if (currentTime - pressTime > STUCK_KEY_TIMEOUT) {
      stuckKeys.push(key)
    }
  }

  // Remove stuck keys, but be careful not to interfere with active shortcuts
  for (const stuckKey of stuckKeys) {
    // If there's an active shortcut, check if this stuck key is part of it
    let shouldRemove = true

    if (isShortcutActive) {
      const { keyboardShortcuts } = store.get(STORE_KEYS.SETTINGS)
      const activeShortcut = keyboardShortcuts
        .filter(ks => ks.keys.length > 0)
        .find(shortcut => {
          const hasAllKeys = shortcut.keys.every(key => pressedKeys.has(key))
          const exactMatch =
            shortcut.keys.length === pressedKeys.size && hasAllKeys
          return exactMatch
        })

      // Don't remove the stuck key if it's part of the currently active shortcut
      if (activeShortcut && activeShortcut.keys.includes(stuckKey)) {
        shouldRemove = false
      }
    }

    if (shouldRemove) {
      console.warn(
        `Removing stuck key: ${stuckKey} (held for ${(currentTime - keyPressTimestamps.get(stuckKey)!) / 1000}s)`,
      )
      pressedKeys.delete(stuckKey)
      keyPressTimestamps.delete(stuckKey)
    }
  }
}

// Start the stuck key checking timer
function startStuckKeyChecker() {
  if (!stuckKeyCheckTimer) {
    stuckKeyCheckTimer = setInterval(
      checkForStuckKeys,
      STUCK_KEY_CHECK_INTERVAL,
    )
  }
}

// Stop the stuck key checking timer
function stopStuckKeyChecker() {
  if (stuckKeyCheckTimer) {
    clearInterval(stuckKeyCheckTimer)
    stuckKeyCheckTimer = null
  }
}

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
    // Track when this key was first pressed (only if not already tracked)
    if (!keyPressTimestamps.has(normalizedKey)) {
      keyPressTimestamps.set(normalizedKey, Date.now())
    }
  } else {
    pressedKeys.delete(normalizedKey)
    keyPressTimestamps.delete(normalizedKey)
  }

  // Check if any of the configured shortcuts are currently held
  // Match shortcuts that have exactly the same keys as currently pressed
  const currentlyHeldShortcut = keyboardShortcuts
    .filter(ks => ks.keys.length > 0)
    .find(shortcut => {
      // Normalize legacy keys in stored shortcuts
      const normalizedShortcutKeys = shortcut.keys.map(normalizeLegacyKey)

      // Check if all shortcut keys are pressed (exact match only)
      const hasAllKeys = normalizedShortcutKeys.every(shortcutKey =>
        pressedKeys.has(shortcutKey),
      )

      const exactMatch =
        normalizedShortcutKeys.length === pressedKeys.size && hasAllKeys

      return exactMatch
    })

  // Only block keys when a complete shortcut is being held
  if (currentlyHeldShortcut) {
    // Block all keys for the currently held shortcut
    blockKeys(getKeysToBlock(currentlyHeldShortcut))
  } else {
    // Unblock all keys when no complete shortcut is pressed
    blockKeys([])
  }

  // Handle shortcut activation with debouncing
  if (currentlyHeldShortcut && !isShortcutActive) {
    // New shortcut detected - start debounce timer
    if (
      !shortcutDebounceTimeout ||
      pendingShortcut?.id !== currentlyHeldShortcut.id
    ) {
      // Clear any existing timeout
      if (shortcutDebounceTimeout) {
        clearTimeout(shortcutDebounceTimeout)
      }

      pendingShortcut = currentlyHeldShortcut
      shortcutDebounceTimeout = setTimeout(() => {
        // After DEBOUNCE milliseconds, if the shortcut is still active, activate it
        if (pendingShortcut && !isShortcutActive) {
          isShortcutActive = true
          console.info('lib Shortcut ACTIVATED, starting recording...')

          // Start trace logging for new interaction
          const interactionId = traceLogger.startInteraction(
            'HOTKEY_ACTIVATED',
            {
              shortcut: pendingShortcut.keys,
              mode: pendingShortcut.mode,
              pressedKeys: Array.from(pressedKeys),
              event: {
                type: event.type,
                key: event.key,
                normalizedKey,
                timestamp: event.timestamp,
              },
            },
          )

          // Store interaction ID for later use
          ;(globalThis as any).currentInteractionId = interactionId

          voiceInputService.startSTTService(pendingShortcut.mode)
        }

        // Clear debounce state
        shortcutDebounceTimeout = null
        pendingShortcut = null
      }, DEBOUNCE_TIME) // debounce
    }
  } else if (!currentlyHeldShortcut) {
    // No shortcut detected - cancel pending activation or deactivate active shortcut
    if (shortcutDebounceTimeout) {
      // Cancel pending activation
      clearTimeout(shortcutDebounceTimeout)
      shortcutDebounceTimeout = null
      pendingShortcut = null
    } else if (isShortcutActive) {
      // Shortcut released - deactivate immediately (no debounce on release)
      isShortcutActive = false
      console.info('lib Shortcut DEACTIVATED, stopping recording...')

      // Don't end the interaction yet - let the transcription service handle it
      // The interaction will be ended when transcription completes or fails
      voiceInputService.stopSTTService()
    }
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

    // Start the stuck key checker
    startStuckKeyChecker()
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

  const keys: string[] = []

  for (const key of shortcut.keys) {
    // Normalize legacy keys (maps base modifiers to left variants)
    const normalizedKey = normalizeLegacyKey(key)
    keys.push(...(reverseKeyNameMap[normalizedKey] || []))
  }

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
    keyPressTimestamps.clear()
    stopStuckKeyChecker()
    KeyListenerProcess.kill('SIGTERM')
    KeyListenerProcess = null
  }
}
