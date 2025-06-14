import { KeyEvent } from '@/lib/preload'

// Map of key names to their normalized UI representations
const keyNameMap: Record<string, string> = {
  // Modifier keys
  MetaLeft: 'command',
  MetaRight: 'command',
  ControlLeft: 'control',
  ControlRight: 'control',
  AltLeft: 'option',
  AltRight: 'option',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  Function: 'fn',
  'Unknown(179)': 'fn', // Special case for Function key

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
 * Normalizes a key event into a format suitable for UI display
 * @param event The key event from the global key listener
 * @returns The normalized key name for UI display
 */
export function normalizeKeyEvent(event: KeyEvent): string {
  console.log('keyboard event', event)
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
  private isFunctionKeyShortcut: boolean = false

  constructor(shortcut: string[] = []) {
    // Check if the shortcut includes the Function key
    this.isFunctionKeyShortcut = shortcut.some(
      (key) => key.toLowerCase() === 'fn' || key.toLowerCase() === 'function'
    )
  }

  /**
   * Updates the key state based on a key event
   * @param event The key event from the global key listener
   */
  update(event: KeyEvent) {
    const key = normalizeKeyEvent(event)

    // Handle Function key special case
    if (this.isFunctionKeyShortcut && event.key === 'Unknown(179)') {
      // Treat Unknown(179) as the Function key
      if (event.type === 'keydown') {
        this.pressedKeys.add('fn')
      } else if (event.type === 'keyup') {
        this.pressedKeys.delete('fn')
      }
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
   * Gets the keys that should be blocked for this shortcut
   * @returns Array of keys to block
   */
  getKeysToBlock(): string[] {
    if (this.isFunctionKeyShortcut) {
      return ['Unknown(179)']
    }
    return []
  }
}
