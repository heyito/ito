import { HeaderValidator } from '../../validation/HeaderValidator.js'
import { WindowContext } from './types.js'
import { ItoMode, ITO_MODE_PROMPT } from './constants.js'

export function addContextToPrompt(
  prompt: string,
  context?: WindowContext,
): string {
  if (context) {
    const contextPrompt = `
    To assist with this, you have been given the following context:
    - ${context.windowTitle}: The title of the current window where the user is working.
    - ${context.appName}: The name of the application where the user is issuing this command.
    `
    return prompt + contextPrompt
  }
  return prompt
}

function validateAndTransformHeaderValue<T>(
  headers: Headers,
  headerName: string,
  defaultValue: T,
  validator: (value: T) => T,
  logName: string,
): T {
  const headerValue = headers.get(headerName)
  let valueToValidate = (headerValue || defaultValue) as T
  if (typeof defaultValue === 'number') {
    valueToValidate = Number(valueToValidate) as T
  }
  const validatedValue = validator(valueToValidate)
  console.log(
    `[Transcription] Using validated ${logName}: ${validatedValue} (source: ${headerValue ? 'header' : 'default'})`,
  )
  return validatedValue
}

export function getAdvancedSettingsHeaders(headers: Headers) {
  const asrModel = validateAndTransformHeaderValue(
    headers,
    'asr-model',
    'whisper-large-v3',
    HeaderValidator.validateAsrModel,
    'ASR model',
  )

  const asrProvider = validateAndTransformHeaderValue(
    headers,
    'asr-provider',
    'groq',
    HeaderValidator.validateAsrProvider,
    'ASR Provider',
  )

  const asrPrompt = validateAndTransformHeaderValue(
    headers,
    'asr-prompt',
    '',
    HeaderValidator.validateAsrPrompt,
    'ASR prompt',
  )

  const llmProvider = validateAndTransformHeaderValue(
    headers,
    'llm-provider',
    'groq',
    HeaderValidator.validateLlmProvider,
    'LLM Provider',
  )

  const llmModel = validateAndTransformHeaderValue(
    headers,
    'llm-model',
    'openai/gpt-oss-120b',
    HeaderValidator.validateLlmModel,
    'LLM model',
  )

  const llmTemperature = validateAndTransformHeaderValue(
    headers,
    'llm-temperature',
    0.1,
    HeaderValidator.validateLlmTemperature,
    'LLM temperature',
  )

  const transcriptionPrompt = validateAndTransformHeaderValue(
    headers,
    'transcription-prompt',
    '',
    HeaderValidator.validateTranscriptionPrompt,
    'Transcription prompt',
  )

  const editingPrompt = validateAndTransformHeaderValue(
    headers,
    'editing-prompt',
    '',
    HeaderValidator.validateEditingPrompt,
    'Editing prompt',
  )

  const noSpeechThreshold = validateAndTransformHeaderValue(
    headers,
    'no-speech-threshold',
    0.35,
    HeaderValidator.validateNoSpeechThreshold,
    'No speech threshold',
  )

  const lowQualityThreshold = validateAndTransformHeaderValue(
    headers,
    'low-quality-threshold',
    -0.55,
    HeaderValidator.validateLowQualityThreshold,
    'Low quality threshold',
  )

  return {
    asrModel,
    asrProvider,
    asrPrompt,
    llmProvider,
    llmModel,
    llmTemperature,
    transcriptionPrompt,
    editingPrompt,
    noSpeechThreshold,
    lowQualityThreshold,
  }
}

export function detectItoMode(transcript: string): ItoMode {
  const words = transcript.trim().split(/\s+/)
  const firstFiveWords = words.slice(0, 5).join(' ').toLowerCase()
  
  return firstFiveWords.includes('hey ito') ? ItoMode.EDIT : ItoMode.TRANSCRIBE
}

export function getPromptForMode(
  mode: ItoMode,
  advancedSettingsHeaders: ReturnType<typeof getAdvancedSettingsHeaders>
): string {
  switch (mode) {
    case ItoMode.EDIT:
      return advancedSettingsHeaders.editingPrompt || ITO_MODE_PROMPT[ItoMode.EDIT]
    case ItoMode.TRANSCRIBE:
      return advancedSettingsHeaders.transcriptionPrompt || ITO_MODE_PROMPT[ItoMode.TRANSCRIBE]
    default:
      return ITO_MODE_PROMPT[ItoMode.TRANSCRIBE]
  }
}
