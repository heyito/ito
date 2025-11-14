import {
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_KEY,
} from '../constants/generated-defaults.js'
import type { LlmSettings } from '@/app/store/useAdvancedSettingsStore'

export function resolveDefaultKeys(
  llmSettings: LlmSettings,
  defaults?: LlmSettings,
): LlmSettings {
  const resolved = { ...llmSettings }

  for (const key in llmSettings) {
    if (llmSettings[key] === DEFAULT_KEY) {
      resolved[key] = defaults?.[key] ?? DEFAULT_ADVANCED_SETTINGS[key]
    }
  }

  return resolved
}
