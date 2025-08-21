import { ItoMode } from '@/app/generated/ito_pb'

type Platform = 'darwin' | 'win32' | 'linux' | 'unknown'

const MODIFIER_ORDER = ['control', 'option', 'shift', 'command', 'fn'] as const

function sortKeysCanonical(keys: string[]): string[] {
  const unique = Array.from(new Set(keys.map(k => k.toLowerCase())))
  const modifiers: string[] = []
  const nonModifiers: string[] = []
  for (const key of unique) {
    if ((MODIFIER_ORDER as readonly string[]).includes(key)) modifiers.push(key)
    else nonModifiers.push(key)
  }
  modifiers.sort(
    (a, b) =>
      MODIFIER_ORDER.indexOf(a as any) - MODIFIER_ORDER.indexOf(b as any),
  )
  nonModifiers.sort()
  return [...modifiers, ...nonModifiers]
}

export function normalizeChord(keys: string[]): string[] {
  return sortKeysCanonical(keys.filter(Boolean))
}

export function chordsEqual(a: string[], b: string[]): boolean {
  const aa = normalizeChord(a)
  const bb = normalizeChord(b)
  if (aa.length !== bb.length) return false
  return aa.every((k, i) => k === bb[i])
}

export function detectConflict(a: string[], b: string[]): boolean {
  return chordsEqual(a, b)
}

export function pickFallback(
  platform: Platform,
  disallowed: string[][] = [],
): string[] {
  const normalizedDisallowed = disallowed.map(normalizeChord)
  const isAllowed = (candidate: string[]) =>
    !normalizedDisallowed.some(c => chordsEqual(c, candidate))

  // Preferred fallback: fn (macOS only)
  if (platform === 'darwin') {
    const candidate = ['fn']
    if (isAllowed(candidate)) return candidate
  }

  // Cross-platform fallback: option+space (Alt+Space on Windows)
  const altSpace = ['option', 'space']
  if (isAllowed(altSpace)) return altSpace

  // Secondary fallback: control+space
  const ctrlSpace = ['control', 'space']
  if (isAllowed(ctrlSpace)) return ctrlSpace

  // Last resort: shift+space
  const shiftSpace = ['shift', 'space']
  if (isAllowed(shiftSpace)) return shiftSpace

  // Give up, return empty (caller should handle)
  return []
}

export function getOtherMode(mode: ItoMode): ItoMode {
  return mode === ItoMode.TRANSCRIBE ? ItoMode.EDIT : ItoMode.TRANSCRIBE
}

export function stringifyChord(keys: string[]): string {
  return normalizeChord(keys).join('+')
}

export function dedupeWithinMode<T extends { keys: string[]; mode: ItoMode }>(
  rows: T[],
): T[] {
  const seenByMode = new Map<ItoMode, Set<string>>()
  const result: T[] = []
  for (const row of rows) {
    const norm = stringifyChord(row.keys)
    const set = seenByMode.get(row.mode) ?? new Set<string>()
    if (!set.has(norm)) {
      set.add(norm)
      seenByMode.set(row.mode, set)
      result.push(row)
    }
  }
  return result
}

export function resolveCrossModeConflicts<
  T extends { keys: string[]; mode: ItoMode },
>(rows: T[], platform: Platform): T[] {
  // Build maps of chords by mode
  const byMode = new Map<ItoMode, Map<string, T>>()
  for (const row of rows) {
    const norm = stringifyChord(row.keys)
    const map = byMode.get(row.mode) ?? new Map<string, T>()
    map.set(norm, row)
    byMode.set(row.mode, map)
  }

  const tMap = byMode.get(ItoMode.TRANSCRIBE) ?? new Map<string, T>()
  const eMap = byMode.get(ItoMode.EDIT) ?? new Map<string, T>()

  // For each conflicting chord present in both maps, move the EDIT one to a fallback
  for (const chord of Array.from(tMap.keys())) {
    if (eMap.has(chord)) {
      const editRow = eMap.get(chord)!
      const disallowed = [Array.from(chord.split('+'))]
      const fallback = pickFallback(platform, disallowed)
      editRow.keys = fallback
      // Update key in map
      eMap.delete(chord)
      eMap.set(stringifyChord(fallback), editRow)
    }
  }

  return [...tMap.values(), ...eMap.values()]
}

export async function detectPlatform(): Promise<Platform> {
  try {
    const info = await window.api.invoke('init-window')
    const p = info?.platform as string | undefined
    if (p === 'darwin' || p === 'win32' || p === 'linux') return p
  } catch (_) {
    // Silent catch - fallback to user agent detection
  }
  // fallback
  const ua = (navigator?.platform || '').toLowerCase()
  if (ua.includes('mac')) return 'darwin'
  if (ua.includes('win')) return 'win32'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}
