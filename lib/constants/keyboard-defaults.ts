import { ItoMode } from '@/app/generated/ito_pb'
import { getPlatform } from '../utils/crossPlatform'

// Platform-specific keyboard shortcut defaults
export const ITO_MODE_SHORTCUT_DEFAULTS_MAC = {
  [ItoMode.TRANSCRIBE]: ['fn'],
  [ItoMode.EDIT]: ['control-left', 'fn'],
}

export const ITO_MODE_SHORTCUT_DEFAULTS_WIN = {
  [ItoMode.TRANSCRIBE]: ['option-left'],
  [ItoMode.EDIT]: ['option-left', 'control-left'],
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
