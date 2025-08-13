import { DEFAULT_ADVANCED_SETTINGS } from '../../constants/generated-defaults.js'

export enum ItoMode {
  TRANSCRIBE = 'transcribe',
  EDIT = 'edit',
}

export const ITO_MODE_PROMPT: { [key in ItoMode]: string } = {
  [ItoMode.TRANSCRIBE]: DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
  [ItoMode.EDIT]: DEFAULT_ADVANCED_SETTINGS.editingPrompt,
}
