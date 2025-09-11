// Shared keyboard key types between keyboard.ts and UI components

// Map of raw key names to their normalized representations
export const keyNameMap: Record<string, KeyName> = {
  MetaLeft: 'command-left',
  MetaRight: 'command-right',
  ControlLeft: 'control-left',
  ControlRight: 'control-right',
  Alt: 'option-left',
  AltGr: 'option-right',
  ShiftLeft: 'shift-left',
  ShiftRight: 'shift-right',
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

export type ModifierKey =
  | 'command-left'
  | 'command-right'
  | 'control-left'
  | 'control-right'
  | 'option-left'
  | 'option-right'
  | 'shift-left'
  | 'shift-right'
  | 'fn'
  | 'fn_fast'

export type RegularKey =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '0'
  | 'space'
  | 'enter'
  | 'esc'
  | 'backspace'
  | 'tab'
  | 'caps'
  | 'delete'
  | '↑'
  | '↓'
  | '←'
  | '→'

export type KeyName = ModifierKey | RegularKey

// Legacy key names for backward compatibility
export const legacyKeyMap: Record<string, string> = {
  command: 'command-left', // Default to left for legacy
  control: 'control-left',
  option: 'option-left',
  shift: 'shift-left',
  alt: 'option-left', // Map alt to option-left for consistency
}

// Function to normalize legacy keys to new format
export function normalizeLegacyKey(key: string): KeyName {
  return (legacyKeyMap[key] || key) as KeyName
}

// Function to check if any modifier (regardless of side) matches
export function isModifierMatch(stored: string, pressed: string): boolean {
  // Strip the -left/-right suffix for comparison
  const getBaseModifier = (key: string) => key.replace(/-(?:left|right)$/, '')

  const storedBase = getBaseModifier(stored)
  const pressedBase = getBaseModifier(pressed)

  // Special case: alt and option are equivalent
  if (
    (storedBase === 'alt' || storedBase === 'option') &&
    (pressedBase === 'alt' || pressedBase === 'option')
  ) {
    return true
  }

  return storedBase === pressedBase
}

// Platform-specific display information
export interface KeyDisplayInfo {
  label: string
  symbol?: string
  isModifier: boolean
  side?: 'left' | 'right'
}

// Helper function to get display info for a key
export function getKeyDisplayInfo(
  keyName: KeyName,
  platform: 'darwin' | 'win32' | 'linux' = (typeof process !== 'undefined'
    ? process.platform
    : 'darwin') as any,
): KeyDisplayInfo {
  // Handle directional modifiers
  if (keyName.includes('-')) {
    const [baseKey, side] = keyName.split('-') as [string, 'left' | 'right']

    switch (baseKey) {
      // Command doesn't exist on Windows/Linux
      case 'command':
        return {
          label: 'cmd',
          symbol: '⌘',
          isModifier: true,
          side,
        }
      case 'control':
        return {
          label: 'ctrl',
          symbol: platform === 'darwin' ? '⌃' : 'Ctrl',
          isModifier: true,
          side,
        }
      case 'shift':
        return {
          label: 'shift',
          symbol: '⇧',
          isModifier: true,
          side,
        }
      case 'fn':
      case 'option':
        // Option key is Alt on Windows/Linux
        if (platform === 'darwin') {
          return {
            label: 'option',
            symbol: '⌥',
            isModifier: true,
            side,
          }
        } else {
          return {
            label: 'alt',
            symbol: 'Alt',
            isModifier: true,
            side,
          }
        }
    }
  }

  // Handle non-directional keys
  switch (keyName) {
    case 'fn':
      return {
        label: 'fn',
        isModifier: true,
      }
    default:
      return {
        label: keyName,
        isModifier: false,
      }
  }
}
