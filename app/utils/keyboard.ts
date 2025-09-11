import { KeyEvent } from '@/lib/preload'
import { KeyboardShortcutConfig } from '@/lib/main/store'
import { ItoMode } from '../generated/ito_pb'
import {
  keyNameMap,
  normalizeLegacyKey,
  getKeyDisplayInfo,
  KeyName,
} from '@/lib/types/keyboard'

/**
 * Helper to format directional indicators for modifier keys
 */
export function getDirectionalIndicator(
  side: 'left' | 'right' | undefined,
  showText: boolean = false,
): string {
  if (!side) return ''
  const arrow = side === 'left' ? '◀' : '▶'
  if (showText) {
    return side === 'left' ? `${arrow} left` : `right ${arrow}`
  }
  return arrow
}

/**
 * Get formatted display components for a key
 * @param keyboardKey The key name to display
 * @param options Display options
 * @returns Object with formatted display components
 */
export function getKeyDisplay(
  keyboardKey: KeyName,
  options: {
    showDirectionalText?: boolean
    format?: 'symbol' | 'label' | 'both'
  } = {},
): string {
  const { showDirectionalText = false, format = 'symbol' } = options

  const displayInfo = getKeyDisplayInfo(keyboardKey as KeyName)
  const dirIndicator = getDirectionalIndicator(
    displayInfo.side,
    showDirectionalText,
  )

  const label = displayInfo.label

  let result: string
  if (displayInfo.isModifier && displayInfo.symbol) {
    if (format === 'symbol') {
      result = displayInfo.symbol
      if (dirIndicator) {
        result = showDirectionalText
          ? `${result} ${dirIndicator}`
          : `${result} ${dirIndicator}`
      }
    } else if (format === 'label') {
      result = label
      if (dirIndicator) {
        result = showDirectionalText
          ? `${result} ${dirIndicator}`
          : `${result} ${dirIndicator}`
      }
    } else {
      // 'both'
      result = `${displayInfo.symbol} ${label}`
      if (dirIndicator) {
        result = `${result} ${dirIndicator}`
      }
    }
  } else {
    result = label
  }

  return result
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
export function normalizeKeyEvent(event: KeyEvent): KeyName {
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

  return key as KeyName
}

export type ShortcutError =
  | 'duplicate-key-same-mode'
  | 'duplicate-key-diff-mode'
  | 'not-found'
  | 'reserved-combination'

export type ShortcutResult = {
  success: boolean
  error?: ShortcutError
  errorMessage?: string
}

const MODIFIER_SEQUENCE = [
  'control',
  'control-left',
  'control-right',
  'option',
  'option-left',
  'option-right',
  'alt',
  'shift',
  'shift-left',
  'shift-right',
  'command',
  'command-left',
  'command-right',
  'fn',
] as const

const MODIFIER_INDEX: Record<string, number> = MODIFIER_SEQUENCE.reduce(
  (acc, key, i) => {
    acc[key] = i
    return acc
  },
  {} as Record<string, number>,
)

function normalizeKey(raw: KeyName): KeyName {
  return raw.trim().toLowerCase() as KeyName
}

function sortKeysCanonical(keys: KeyName[]): KeyName[] {
  const unique = Array.from(new Set(keys.map(normalizeKey)))

  const modifiers: KeyName[] = []
  const nonModifiers: KeyName[] = []

  for (const key of unique) {
    if (key in MODIFIER_INDEX) modifiers.push(key)
    else nonModifiers.push(key)
  }

  modifiers.sort((a, b) => MODIFIER_INDEX[a] - MODIFIER_INDEX[b])
  nonModifiers.sort() // simple alphabetical for everything else

  return [...modifiers, ...nonModifiers]
}

export function normalizeChord(keys: KeyName[]): KeyName[] {
  return sortKeysCanonical(keys.filter(Boolean))
}

// Helper to generate all variants of a modifier key (base, left, right)
function modifierVariants(modifier: string): string[] {
  return [modifier, `${modifier}-left`, `${modifier}-right`]
}

// Helper to create reserved combinations for all variants of a modifier
function createReservedCombos(modifier: string, key: string, reason: string) {
  return modifierVariants(modifier).map(mod => ({ keys: [mod, key], reason }))
}

// Reserved key combinations that would conflict with app functionality
const RESERVED_COMBINATIONS = [
  // Copy combinations
  ...createReservedCombos(
    'command',
    'c',
    'Reserved for text selection copying',
  ),
  ...createReservedCombos(
    'control',
    'c',
    'Reserved for text selection copying',
  ),

  // Paste combinations
  ...createReservedCombos(
    'command',
    'v',
    'Reserved for text selection pasting',
  ),
  ...createReservedCombos(
    'control',
    'v',
    'Reserved for text selection pasting',
  ),

  // System commands
  ...createReservedCombos('command', 'q', 'System quit command'),
  ...createReservedCombos('command', 'w', 'System close window'),

  // Tab/app switching
  ...createReservedCombos('command', 'tab', 'System app switching'),
  ...createReservedCombos('control', 'tab', 'Browser tab switching'),
] as { keys: KeyName[]; reason?: string }[]

// Check if a shortcut contains reserved key combinations
export function isReservedCombination(keys: KeyName[]): {
  isReserved: boolean
  reason?: string
} {
  // Normalize legacy keys to new format
  const normalizedKeys = sortKeysCanonical(keys.map(normalizeLegacyKey))

  for (const reserved of RESERVED_COMBINATIONS) {
    const normalizedReserved = sortKeysCanonical(reserved.keys)

    // Check if the shortcut contains all keys from a reserved combination (exact match)
    const containsAllReserved = normalizedReserved.every(reservedKey => {
      return normalizedKeys.includes(reservedKey)
    })

    if (containsAllReserved) {
      return { isReserved: true, reason: reserved.reason }
    }
  }

  return { isReserved: false }
}

// Returns the mode of the duplicate shortcut if found, otherwise undefined
export function isDuplicateShortcut(
  currentShortcuts: KeyboardShortcutConfig[],
  shortcutToCheck: KeyboardShortcutConfig,
): ItoMode | undefined {
  // Normalize keys for comparison
  const normalizedCheckKeys = sortKeysCanonical(
    shortcutToCheck.keys.map(normalizeLegacyKey),
  )

  const duplicate = currentShortcuts.find(ks => {
    if (ks.id === shortcutToCheck.id) return false

    const normalizedStoredKeys = sortKeysCanonical(
      ks.keys.map(normalizeLegacyKey),
    )

    // Check if all keys match exactly
    return (
      JSON.stringify(normalizedCheckKeys) ===
      JSON.stringify(normalizedStoredKeys)
    )
  })

  if (duplicate) {
    return duplicate.mode
  }

  return undefined
}

// Helper to validate duplicate shortcuts and return appropriate error result
export function validateShortcutForDuplicate(
  currentShortcuts: KeyboardShortcutConfig[],
  shortcutToCheck: KeyboardShortcutConfig,
  expectedMode: ItoMode,
): ShortcutResult | null {
  const duplicateMode = isDuplicateShortcut(currentShortcuts, shortcutToCheck)

  if (duplicateMode !== undefined) {
    const sameMode = duplicateMode === expectedMode
    return {
      success: false,
      error: sameMode ? 'duplicate-key-same-mode' : 'duplicate-key-diff-mode',
    }
  }

  return null // No duplicate found, validation passes
}

/**
 * Tracks the state of currently pressed keys
 */
export class KeyState {
  private pressedKeys: Set<KeyName> = new Set()
  private shortcut: KeyName[] = []

  constructor(shortcut: KeyName[] = []) {
    this.updateShortcut(shortcut)
  }

  /**
   * Updates the shortcut and instructs the native listener to block the relevant keys.
   * @param shortcut The shortcut to set, as an array of normalized key names.
   */
  updateShortcut(shortcut: KeyName[]) {
    // Normalize legacy keys to new format
    this.shortcut = shortcut.map(normalizeLegacyKey)
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
  isKeyPressed(key: KeyName): boolean {
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
    const keys: string[] = []

    for (const normalizedKey of this.shortcut) {
      keys.push(...(reverseKeyNameMap[normalizedKey] || []))
    }

    // Also block the special "fast fn" key if fn is part of the shortcut.
    if (this.shortcut.includes('fn')) {
      keys.push('Unknown(179)')
    }

    // Return a unique set of keys.
    return [...new Set(keys)]
  }
}
