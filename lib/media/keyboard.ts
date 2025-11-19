import { spawn } from 'child_process'
import store, { KeyboardShortcutConfig } from '../main/store'
import { STORE_KEYS } from '../constants/store-keys'
import { getNativeBinaryPath } from './native-interface'
import { BrowserWindow } from 'electron'
import { itoSessionManager } from '../main/itoSessionManager'
import { KeyName, keyNameMap, normalizeLegacyKey } from '../types/keyboard'

interface KeyEvent {
  type: 'keydown' | 'keyup'
  key: string
  timestamp: string
  raw_code: number
}

interface HeartbeatEvent {
  type: 'heartbeat_ping'
  id: string
  timestamp: string
}

interface RegisteredHotkeysEvent {
  type: 'registered_hotkeys'
  hotkeys: Array<{ keys: string[] }>
}

type ProcessEvent = KeyEvent | HeartbeatEvent | RegisteredHotkeysEvent

// Global key listener process singleton
export let KeyListenerProcess: ReturnType<typeof spawn> | null = null
let activeShortcutId: string | null = null

// Heartbeat monitoring state
let lastHeartbeatReceived = Date.now()
let heartbeatCheckTimer: NodeJS.Timeout | null = null
const HEARTBEAT_CHECK_INTERVAL_MS = 5000 // Check every 5 seconds
const HEARTBEAT_TIMEOUT_MS = 15000 // 15 seconds without heartbeat triggers restart

// Test utility function - only available in development
export const resetForTesting = () => {
  if (process.env.NODE_ENV !== 'production') {
    KeyListenerProcess = null
    activeShortcutId = null
    pressedKeys.clear()
    keyPressTimestamps.clear()
    stopStuckKeyChecker()
    stopHeartbeatChecker()
    lastHeartbeatReceived = Date.now()
  }
}

const nativeModuleName = 'global-key-listener'

// Normalizes a raw key event into a consistent string
function normalizeKey(rawKey: string): KeyName {
  return keyNameMap[rawKey] || rawKey.toLowerCase()
}

// Export the key name mapping for use in UI components
export { keyNameMap }

// Heartbeat utility functions
function handleHeartbeat(_event: HeartbeatEvent) {
  lastHeartbeatReceived = Date.now()
}

function startHeartbeatChecker() {
  if (!heartbeatCheckTimer) {
    heartbeatCheckTimer = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - lastHeartbeatReceived
      if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        console.error(
          `[Key listener] No heartbeat received for ${timeSinceLastHeartbeat}ms, restarting key listener...`,
        )
        restartKeyListener()
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS)
  }
}

function stopHeartbeatChecker() {
  if (heartbeatCheckTimer) {
    clearInterval(heartbeatCheckTimer)
    heartbeatCheckTimer = null
  }
}

function restartKeyListener() {
  console.warn('🔄 Restarting keyboard listener due to timeout...')
  stopKeyListener()
  // Wait a brief moment before restarting to ensure cleanup is complete
  setTimeout(() => {
    startKeyListener()
  }, 1000)
}

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

    if (activeShortcutId !== null) {
      const { keyboardShortcuts } = store.get(STORE_KEYS.SETTINGS)
      const activeShortcut = keyboardShortcuts
        .filter(ks => ks.keys.length > 0)
        .find(shortcut => {
          const normalizedShortcutKeys = shortcut.keys.map(normalizeLegacyKey)
          const hasAllKeys = normalizedShortcutKeys.every(key =>
            pressedKeys.has(key),
          )
          const exactMatch =
            normalizedShortcutKeys.length === pressedKeys.size && hasAllKeys
          return exactMatch
        })

      // Don't remove the stuck key if it's part of the currently active shortcut
      if (
        activeShortcut &&
        activeShortcut.keys.map(normalizeLegacyKey).includes(stuckKey)
      ) {
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

async function handleKeyEventInMain(event: KeyEvent) {
  const { isShortcutGloballyEnabled, keyboardShortcuts } = store.get(
    STORE_KEYS.SETTINGS,
  )

  if (!isShortcutGloballyEnabled) {
    // check to see if we should stop an in-progress recording
    if (activeShortcutId !== null) {
      // Shortcut released
      activeShortcutId = null
      console.info('Shortcut DEACTIVATED, stopping recording...')
      itoSessionManager.completeSession()
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

  // Handle shortcut activation and mode changes
  if (currentlyHeldShortcut) {
    if (activeShortcutId === null) {
      // Starting a new session
      activeShortcutId = currentlyHeldShortcut.id
      console.info('lib Shortcut ACTIVATED, starting recording...')
      await itoSessionManager.startSession(currentlyHeldShortcut.mode)
    } else if (activeShortcutId !== currentlyHeldShortcut.id) {
      // Different shortcut detected while already recording - change mode
      activeShortcutId = currentlyHeldShortcut.id
      console.info(
        `lib Shortcut mode CHANGED to ${currentlyHeldShortcut.mode}, updating session...`,
      )
      itoSessionManager.setMode(currentlyHeldShortcut.mode)
    }
  } else if (!currentlyHeldShortcut) {
    // No shortcut detected - cancel pending activation or deactivate active shortcut
    if (activeShortcutId !== null) {
      // Shortcut released - deactivate immediately (no debounce on release)
      activeShortcutId = null
      console.info('lib Shortcut DEACTIVATED, stopping recording...')
      itoSessionManager.completeSession()
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
            const event: ProcessEvent = JSON.parse(line)

            // Handle heartbeat and other system events
            if (event.type === 'heartbeat_ping') {
              handleHeartbeat(event)
              continue
            } else if (event.type === 'registered_hotkeys') {
              // Log registered hotkeys for debugging
              console.info('🔒 Registered hotkeys received:', event.hotkeys)
              continue
            }

            // Handle regular key events
            if (event.type === 'keydown' || event.type === 'keyup') {
              // Process the event here in the main process for hotkey detection.
              handleKeyEventInMain(event)

              // Broadcast the raw event to all renderer windows for UI updates.
              BrowserWindow.getAllWindows().forEach(window => {
                if (!window.webContents.isDestroyed()) {
                  window.webContents.send('key-event', event)
                }
              })
            }
          } catch (e) {
            console.error('Failed to parse key process event:', line, e)
          }
        }
      }
    })

    KeyListenerProcess.stderr?.on('data', data => {
      console.error('[Key listener] stderr:', data.toString())
    })

    KeyListenerProcess.on('error', error => {
      console.error('[Key listener] process spawn error:', error)
      KeyListenerProcess = null
    })

    KeyListenerProcess.on('close', (code, signal) => {
      console.warn(
        `[Key listener] process closed with code: ${code}, signal: ${signal}`,
      )
      KeyListenerProcess = null
    })

    KeyListenerProcess.on('exit', (code, signal) => {
      console.warn(
        `[Key listener] process exited with code: ${code}, signal: ${signal}`,
      )
      KeyListenerProcess = null
    })

    console.log('[Key listener] started successfully.')

    // Register all configured hotkeys with the listener
    registerAllHotkeys()

    // Start the stuck key checker
    startStuckKeyChecker()

    // Start heartbeat monitoring
    lastHeartbeatReceived = Date.now()
    startHeartbeatChecker()
  } catch (error) {
    console.error('Failed to start key listener:', error)
    KeyListenerProcess = null
  }
}

// Register all hotkeys from settings with the key listener
export const registerAllHotkeys = () => {
  if (!KeyListenerProcess) {
    console.warn('Key listener not running, cannot register hotkeys.')
    return
  }

  const { keyboardShortcuts } = store.get(STORE_KEYS.SETTINGS)

  // Convert shortcuts to hotkey format for the listener
  const hotkeys = keyboardShortcuts
    .filter(ks => ks.keys.length > 0)
    .map(shortcut => ({
      keys: getKeysToRegister(shortcut),
    }))

  console.info('Registering hotkeys with listener:', hotkeys)

  KeyListenerProcess.stdin?.write(
    JSON.stringify({ command: 'register_hotkeys', hotkeys }) + '\n',
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

const getKeysToRegister = (shortcut?: KeyboardShortcutConfig): string[] => {
  if (!shortcut) {
    return []
  }

  const keys: string[] = []

  for (const key of shortcut.keys) {
    // Normalize legacy keys (maps base modifiers to left variants)
    const normalizedKey = normalizeLegacyKey(key)
    const reverseMappedKeys = reverseKeyNameMap[normalizedKey]

    if (reverseMappedKeys && reverseMappedKeys.length > 0) {
      // Use the reverse mapping if available
      keys.push(...reverseMappedKeys)
    } else {
      // Fallback: use the original key name as-is
      // This works because the key names come from rdev originally
      keys.push(key)
    }
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

    // Clean up heartbeat state
    stopHeartbeatChecker()

    KeyListenerProcess.kill('SIGTERM')
    KeyListenerProcess = null
  }
}
