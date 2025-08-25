import { HeaderValidator } from '../../validation/HeaderValidator.js'
import { ItoContext } from './types.js'
import { ITO_MODE_PROMPT } from './constants.js'
import { DEFAULT_ADVANCED_SETTINGS } from '../../constants/generated-defaults.js'
import { ItoMode } from '../../generated/ito_pb.js'

export function addContextToPrompt(
  prompt: string,
  context?: ItoContext,
): string {
  if (context) {
    const contextPrompt = `
    To assist with this, you have been given the following context:
    - ${context.windowTitle}: The title of the current window where the user is working.
    - ${context.appName}: The name of the application where the user is issuing this command.
    - ${context.contextText}: The text that the user currently has selected wants to edit.
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
    DEFAULT_ADVANCED_SETTINGS.asrModel,
    HeaderValidator.validateAsrModel,
    'ASR model',
  )

  const asrProvider = validateAndTransformHeaderValue(
    headers,
    'asr-provider',
    DEFAULT_ADVANCED_SETTINGS.asrProvider,
    HeaderValidator.validateAsrProvider,
    'ASR Provider',
  )

  const asrPrompt = validateAndTransformHeaderValue(
    headers,
    'asr-prompt',
    DEFAULT_ADVANCED_SETTINGS.asrPrompt,
    HeaderValidator.validateAsrPrompt,
    'ASR prompt',
  )

  const llmProvider = validateAndTransformHeaderValue(
    headers,
    'llm-provider',
    DEFAULT_ADVANCED_SETTINGS.llmProvider,
    HeaderValidator.validateLlmProvider,
    'LLM Provider',
  )

  const llmModel = validateAndTransformHeaderValue(
    headers,
    'llm-model',
    DEFAULT_ADVANCED_SETTINGS.llmModel,
    HeaderValidator.validateLlmModel,
    'LLM model',
  )

  const llmTemperature = validateAndTransformHeaderValue(
    headers,
    'llm-temperature',
    DEFAULT_ADVANCED_SETTINGS.llmTemperature,
    HeaderValidator.validateLlmTemperature,
    'LLM temperature',
  )

  const transcriptionPrompt = validateAndTransformHeaderValue(
    headers,
    'transcription-prompt',
    DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
    HeaderValidator.validateTranscriptionPrompt,
    'Transcription prompt',
  )

  const editingPrompt = validateAndTransformHeaderValue(
    headers,
    'editing-prompt',
    DEFAULT_ADVANCED_SETTINGS.editingPrompt,
    HeaderValidator.validateEditingPrompt,
    'Editing prompt',
  )

  const noSpeechThreshold = validateAndTransformHeaderValue(
    headers,
    'no-speech-threshold',
    DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold,
    HeaderValidator.validateNoSpeechThreshold,
    'No speech threshold',
  )

  const lowQualityThreshold = validateAndTransformHeaderValue(
    headers,
    'low-quality-threshold',
    DEFAULT_ADVANCED_SETTINGS.lowQualityThreshold,
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

export function getItoMode(input: unknown): ItoMode | undefined {
  try {
    const inputNumber = Number(input)
    if (isNaN(inputNumber) || !Number.isFinite(inputNumber)) {
      return undefined
    }

    return inputNumber as ItoMode
  } catch (error) {
    console.error('Error parsing Ito mode:', error)
    return undefined
  }
}

export function detectItoMode(transcript: string): ItoMode {
  const words = transcript.trim().split(/\s+/)
  const firstFiveWords = words.slice(0, 5).join(' ').toLowerCase()

  return firstFiveWords.includes('hey ito') ? ItoMode.EDIT : ItoMode.TRANSCRIBE
}

export function getPromptForMode(
  mode: ItoMode,
  advancedSettingsHeaders: ReturnType<typeof getAdvancedSettingsHeaders>,
): string {
  switch (mode) {
    case ItoMode.EDIT:
      return (
        advancedSettingsHeaders.editingPrompt || ITO_MODE_PROMPT[ItoMode.EDIT]
      )
    case ItoMode.TRANSCRIBE:
      return (
        advancedSettingsHeaders.transcriptionPrompt ||
        ITO_MODE_PROMPT[ItoMode.TRANSCRIBE]
      )
    default:
      return ITO_MODE_PROMPT[ItoMode.TRANSCRIBE]
  }
}
