import { KeyboardShortcutConfig } from '@/lib/main/store'
import { ItoMode } from '../generated/ito_pb'

export type ShortcutResult = {
  success: boolean
  error?: 'duplicate-key-same-mode' | 'duplicate-key-diff-mode' | 'not-found'
}

const MODIFIER_SEQUENCE = [
  'control',
  'option',
  'alt',
  'shift',
  'command',
  'fn',
] as const

const MODIFIER_INDEX: Record<string, number> = MODIFIER_SEQUENCE.reduce(
  (acc, key, i) => {
    acc[key] = i
    return acc
  },
  {} as Record<string, number>,
)

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase()
}

function sortKeysCanonical(keys: string[]): string[] {
  const unique = Array.from(new Set(keys.map(normalizeKey)))

  const modifiers: string[] = []
  const nonModifiers: string[] = []

  for (const key of unique) {
    if (key in MODIFIER_INDEX) modifiers.push(key)
    else nonModifiers.push(key)
  }

  modifiers.sort((a, b) => MODIFIER_INDEX[a] - MODIFIER_INDEX[b])
  nonModifiers.sort() // simple alphabetical for everything else

  return [...modifiers, ...nonModifiers]
}

export function normalizeChord(keys: string[]): string[] {
  return sortKeysCanonical(keys.filter(Boolean))
}

// Returns the mode of the duplicate shortcut if found, otherwise undefined
export function isDuplicateShortcut(
  currentShortcuts: KeyboardShortcutConfig[],
  shortcutToCheck: KeyboardShortcutConfig,
): ItoMode | undefined {
  const duplicate = currentShortcuts.find(
    ks =>
      ks.id !== shortcutToCheck.id &&
      ks.keys.join(',') === shortcutToCheck.keys.join(','),
  )

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
      error: sameMode
        ? 'duplicate-key-same-mode'
        : 'duplicate-key-diff-mode',
    }
  }

  return null // No duplicate found, validation passes
}
