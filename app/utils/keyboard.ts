import { KeyEvent } from '@/lib/preload'

// Map of key names to their normalized UI representations
const keyNameMap: Record<string, string> = {
  // Modifier keys
  MetaLeft: 'command',
  MetaRight: 'command',
  ControlLeft: 'control',
  ControlRight: 'control',
  Alt: 'option',
  AltGr: 'option',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  Function: 'fn',
  'Unknown(179)': 'fn_fast', // Happens when pressing and releasing fn quickly

  // Letter keys (remove the 'Key' prefix)
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

  // Number keys (remove the 'Digit' prefix)
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

  // Special keys
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

/**
 * Normalizes a key event into a format suitable for UI display
 * @param event The key event from the global key listener
 * @returns The normalized key name for UI display
 */
export function normalizeKeyEvent(event: KeyEvent): string {
  // If we have a mapping for this key, use it
  if (keyNameMap[event.key]) {
    return keyNameMap[event.key]
  }

  // For unknown keys, try to clean up the name
  const key = event.key
    .toLowerCase()
    .replace(/^key/, '') // Remove 'Key' prefix
    .replace(/^digit/, '') // Remove 'Digit' prefix
    .replace(/^arrow/, '') // Remove 'Arrow' prefix
    .replace(/^(left|right)$/, '') // Remove 'Left'/'Right' suffix

  return key || 'unknown'
}

/**
 * Tracks the state of currently pressed keys
 */
export class KeyState {
  private pressedKeys: Set<string> = new Set()
  private shortcut: string[] = []

  constructor(shortcut: string[] = []) {
    this.updateShortcut(shortcut)
  }

  /**
   * Updates the shortcut and instructs the native listener to block the relevant keys.
   * @param shortcut The shortcut to set, as an array of normalized key names.
   */
  updateShortcut(shortcut: string[]) {
    this.shortcut = shortcut
    const keysToBlock = this.getKeysToBlock()
    window.api.blockKeys(keysToBlock)
  }

  /**
   * Updates the key state based on a key event
   * @param event The key event from the global key listener
   */
  update(event: KeyEvent) {
    const key = normalizeKeyEvent(event)

    // Handle Function key special case
    if (key === 'fn_fast') {
      return
    }

    if (event.type === 'keydown') {
      this.pressedKeys.add(key)
    } else if (event.type === 'keyup') {
      this.pressedKeys.delete(key)
    }
  }

  /**
   * Gets the currently pressed keys
   * @returns Array of currently pressed key names
   */
  getPressedKeys(): string[] {
    return Array.from(this.pressedKeys)
  }

  /**
   * Checks if a specific key is currently pressed
   * @param key The normalized key name to check
   * @returns Whether the key is currently pressed
   */
  isKeyPressed(key: string): boolean {
    return this.pressedKeys.has(key)
  }

  /**
   * Clears all pressed keys
   */
  clear() {
    this.pressedKeys.clear()
  }

  /**
   * Gets the raw `rdev` key names that should be blocked for the current shortcut.
   * @returns Array of keys to block
   */
  private getKeysToBlock(): string[] {
    // Use the reverse map to find all raw keys for the normalized shortcut keys.
    const keys = this.shortcut.flatMap(
      (normalizedKey) => reverseKeyNameMap[normalizedKey] || [],
    )

    // Also block the special "fast fn" key if fn is part of the shortcut.
    if (this.shortcut.includes('fn')) {
      keys.push('Unknown(179)')
    }

    // Return a unique set of keys.
    return [...new Set(keys)]
  }
}
