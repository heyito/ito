import { DEFAULT_ADVANCED_SETTINGS } from '../constants/generated-defaults.js'
import type { LlmSettings } from '@/app/store/useAdvancedSettingsStore'

export function resolveDefaultKeys(
  llmSettings: LlmSettings,
  defaults?: LlmSettings,
): LlmSettings {
  const resolved = { ...llmSettings }

  for (const key in llmSettings) {
    const typedKey = key as keyof LlmSettings
    if (llmSettings[typedKey] === null) {
      resolved[typedKey] = (defaults?.[typedKey] ??
        DEFAULT_ADVANCED_SETTINGS[typedKey]) as any
    }
  }

  return resolved
}
