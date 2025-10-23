import { ConnectError, Code } from '@connectrpc/connect'
import {
  AsrModelSchema,
  AsrPromptSchema,
  AsrProviderSchema,
  LlmModelSchema,
  LlmPromptSchema,
  LlmProviderSchema,
  LLMTemperatureSchema,
  NoSpeechThresholdSchema,
  VocabularySchema,
} from './schemas.js'

/**
 * Validates gRPC header values using Zod schemas
 */
export class HeaderValidator {
  static validateAsrModel(headerValue: string): string {
    try {
      return AsrModelSchema.parse(headerValue)
    } catch (error) {
      throw new ConnectError(
        `Invalid ASR model: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Code.InvalidArgument,
      )
    }
  }

  static validateAsrProvider(headerValue: string): string {
    try {
      return AsrProviderSchema.parse(headerValue)
    } catch (error) {
      throw new ConnectError(
        `Invalid ASR provider: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Code.InvalidArgument,
      )
    }
  }

  static validateAsrPrompt(headerValue: string): string {
    try {
      return AsrPromptSchema.parse(headerValue)
    } catch (error) {
      throw new ConnectError(
        `Invalid ASR prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Code.InvalidArgument,
      )
    }
  }

  static validateLlmProvider(headerValue: string): string {
    try {
      return LlmProviderSchema.parse(headerValue)
    } catch (error) {
      throw new ConnectError(
        `Invalid LLM provider: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Code.InvalidArgument,
      )
    }
  }

  static validateLlmModel(headerValue: string): string {
    try {
      return LlmModelSchema.parse(headerValue)
    } catch (error) {
      throw new ConnectError(
        `Invalid LLM model: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Code.InvalidArgument,
      )
    }
  }

  static validateLlmTemperature(headerValue: number): number {
    try {
      return LLMTemperatureSchema.parse(headerValue)
    } catch (error) {
      throw new ConnectError(
        `Invalid LLM temperature: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Code.InvalidArgument,
      )
    }
  }

  static validateTranscriptionPrompt(headerValue: string): string {
    try {
      console.log(
        'Validating transcription prompt:',
        headerValue.slice(0, 50) + '...',
      )
      return LlmPromptSchema.parse(headerValue)
    } catch (error) {
      throw new ConnectError(
        `Invalid transcription prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Code.InvalidArgument,
      )
    }
  }

  static validateEditingPrompt(headerValue: string): string {
    try {
      return LlmPromptSchema.parse(headerValue)
    } catch (error) {
      throw new ConnectError(
        `Invalid editing prompt: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Code.InvalidArgument,
      )
    }
  }

  static validateNoSpeechThreshold(headerValue: number): number {
    try {
      return NoSpeechThresholdSchema.parse(headerValue)
    } catch (error) {
      throw new ConnectError(
        `Invalid no speech threshold: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Code.InvalidArgument,
      )
    }
  }

  static validateVocabulary(headerValue: string): string[] {
    try {
      return VocabularySchema.parse(headerValue)
    } catch (error) {
      throw new ConnectError(
        `Invalid vocabulary: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Code.InvalidArgument,
      )
    }
  }
}
