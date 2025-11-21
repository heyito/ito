import { describe, expect, test } from 'bun:test'
import { resolveDefaultKeys } from './settings'
import { DEFAULT_ADVANCED_SETTINGS } from '../constants/generated-defaults'

const settings = {
  asrProvider: 'asrProvider',
  asrModel: 'asrModel',
  asrPrompt: 'asrPrompt',
  llmProvider: 'llmProvider',
  llmModel: 'llmModel',
  llmTemperature: 0.5,
  transcriptionPrompt: 'transcriptionPrompt',
  editingPrompt: 'editingPrompt',
  noSpeechThreshold: 0.7,
}

const defaults = {
  asrProvider: 'defaultAsrProvider',
  asrModel: 'defaultAsrModel',
  asrPrompt: 'defaultAsrPrompt',
  llmProvider: 'defaultLlmProvider',
  llmModel: 'defaultLlmModel',
  llmTemperature: 0.8,
  transcriptionPrompt: 'defaultTranscriptionPrompt',
  editingPrompt: 'defaultEditingPrompt',
  noSpeechThreshold: 0.9,
}

describe('resolve default keys', () => {
  test('should resolve null values correctly', () => {
    const testSettings = {
      ...settings,
      asrProvider: null,
      asrModel: null,
    }
    const result = resolveDefaultKeys(testSettings, defaults)
    expect(result.asrProvider).toBe(defaults.asrProvider)
    expect(result.asrModel).toBe(defaults.asrModel)
    expect(result.asrPrompt).toBe(settings.asrPrompt)
  })

  test('if null but no default provided, should fallback to constants', () => {
    const testSettings = {
      ...settings,
      asrProvider: null,
      asrModel: null,
      llmProvider: null,
    }
    const result = resolveDefaultKeys(testSettings)
    expect(result.asrProvider).toBe(DEFAULT_ADVANCED_SETTINGS.asrProvider)
    expect(result.asrModel).toBe(DEFAULT_ADVANCED_SETTINGS.asrModel)
    expect(result.llmProvider).toBe(DEFAULT_ADVANCED_SETTINGS.llmProvider)
  })
})
