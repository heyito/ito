import { ItoMode } from '@/app/generated/ito_pb'

// Platform-specific keyboard shortcut defaults
export const ITO_MODE_SHORTCUT_DEFAULTS_MAC = {
  [ItoMode.TRANSCRIBE]: ['fn'],
  [ItoMode.EDIT]: ['control-left', 'fn'],
}

export const ITO_MODE_SHORTCUT_DEFAULTS_WIN = {
  [ItoMode.TRANSCRIBE]: ['control-left', 'command-left'],
  [ItoMode.EDIT]: ['option-left', 'control-left'],
}

// Helper to detect platform - works in both main and renderer process
export function getPlatform(): 'darwin' | 'win32' {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform as 'darwin' | 'win32'
  }
  // Fallback if process is not available
  return 'darwin'
}

// Get platform-specific defaults
export function getItoModeShortcutDefaults(
  platform?: 'darwin' | 'win32',
): Record<ItoMode, string[]> {
  const currentPlatform = platform || getPlatform()

  if (currentPlatform === 'darwin') {
    return ITO_MODE_SHORTCUT_DEFAULTS_MAC
  } else {
    return ITO_MODE_SHORTCUT_DEFAULTS_WIN
  }
}

// For backward compatibility, export the defaults for the current platform
export const ITO_MODE_SHORTCUT_DEFAULTS = getItoModeShortcutDefaults()
