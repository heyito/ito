import { describe, expect, test } from 'bun:test'
import { resolveDefaultKeys } from './settings'
import {
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_KEY,
} from '../constants/generated-defaults'

const settings = {
  asrProvider: 'asrProvider',
  asrModel: 'asrModel',
  asrPrompt: 'asrPrompt',
  llmProvider: 'llmProvider',
  llmModel: 'llmModel',
  llmTemperature: 'llmTemperature',
  transcriptionPrompt: 'transcriptionPrompt',
  editingPrompt: 'editingPrompt',
  noSpeechThreshold: 'noSpeechThreshold',
}

const defaults = {
  asrProvider: 'defaultAsrProvider',
  asrModel: 'defaultAsrModel',
  asrPrompt: 'defaultAsrPrompt',
  llmProvider: 'defaultLlmProvider',
  llmModel: 'defaultLlmModel',
  llmTemperature: 'defaultLlmTemperature',
  transcriptionPrompt: 'defaultTranscriptionPrompt',
  editingPrompt: 'defaultEditingPrompt',
  noSpeechThreshold: 'defaultNoSpeechThreshold',
}

describe('resolve default keys', () => {
  test('should resolve default keys correctly', () => {
    const testSettings = {
      ...settings,
      asrProvider: DEFAULT_KEY,
      asrModel: DEFAULT_KEY,
    }
    const result = resolveDefaultKeys(testSettings, defaults)
    expect(result.asrProvider).toBe(defaults.asrProvider)
    expect(result.asrModel).toBe(defaults.asrModel)
    expect(result.asrPrompt).toBe(settings.asrPrompt)
  })

  test('if default key but no default, should fallback', () => {
    const testSettings = {
      ...settings,
      asrProvider: DEFAULT_KEY,
      asrModel: DEFAULT_KEY,
      llmProvider: DEFAULT_KEY,
    }
    const result = resolveDefaultKeys(testSettings)
    expect(result.asrProvider).toBe(DEFAULT_ADVANCED_SETTINGS.asrProvider)
    expect(result.asrModel).toBe(DEFAULT_ADVANCED_SETTINGS.asrModel)
    expect(result.llmProvider).toBe(DEFAULT_ADVANCED_SETTINGS.llmProvider)
  })
})
