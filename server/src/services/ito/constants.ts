import { DEFAULT_ADVANCED_SETTINGS } from '../../constants/generated-defaults.js'
import { ItoMode } from '../../generated/ito_pb.js'

export const ITO_MODE_PROMPT: { [key in ItoMode]: string } = {
  [ItoMode.TRANSCRIBE]: DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
  [ItoMode.EDIT]: DEFAULT_ADVANCED_SETTINGS.editingPrompt,
}

export const ITO_MODE_SYSTEM_PROMPT: { [key in ItoMode]: string } = {
  [ItoMode.TRANSCRIBE]: 'You are a helpful AI transcription assistant.',
  [ItoMode.EDIT]: 'You are an AI assistant helping to edit documents.',
}

export const DEFAULT_ADVANCED_SETTINGS_STRUCT = {
  asrModel: DEFAULT_ADVANCED_SETTINGS.asrModel,
  asrPrompt: DEFAULT_ADVANCED_SETTINGS.asrPrompt,
  asrProvider: DEFAULT_ADVANCED_SETTINGS.asrProvider,
  llmProvider: DEFAULT_ADVANCED_SETTINGS.llmProvider,
  llmTemperature: DEFAULT_ADVANCED_SETTINGS.llmTemperature,
  llmModel: DEFAULT_ADVANCED_SETTINGS.llmModel,
  transcriptionPrompt: DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
  editingPrompt: DEFAULT_ADVANCED_SETTINGS.editingPrompt,
  noSpeechThreshold: DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold,
}
