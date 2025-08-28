import { create } from '@bufbuild/protobuf'
import {
  ClientError as ClientErrorPb,
  ClientErrorSchema,
  ClientProvider as ClientProviderPb,
  ErrorType as ErrorTypePb,
} from '../generated/ito_pb.js'
import { ClientProvider } from './providers.js'

export enum ErrorType {
  CONFIGURATION = 'configuration',
  AVAILABILITY = 'availability',
  AUDIO = 'audio',
  API = 'api',
}

/**
 * Base error class for all client-related errors
 */
export abstract class ClientError extends Error {
  abstract readonly code: string
  abstract readonly type: ErrorType

  constructor(
    message: string,
    public readonly provider: ClientProvider,
    public readonly details?: Record<string, any>,
  ) {
    super(message)
    this.name = this.constructor.name
  }

  /**
   * Maps TypeScript ClientProvider enum to protobuf ClientProvider enum
   */
  private mapProviderToProtobuf(provider: ClientProvider): ClientProviderPb {
    switch (provider) {
      case ClientProvider.GROQ:
        return ClientProviderPb.GROQ
      case ClientProvider.CEREBRAS:
        return ClientProviderPb.CEREBRAS
      default:
        return ClientProviderPb.GROQ
    }
  }

  /**
   * Maps TypeScript ErrorType enum to protobuf ErrorType enum
   */
  private mapErrorTypeToProtobuf(type: ErrorType): ErrorTypePb {
    switch (type) {
      case ErrorType.CONFIGURATION:
        return ErrorTypePb.CONFIGURATION
      case ErrorType.AVAILABILITY:
        return ErrorTypePb.AVAILABILITY
      case ErrorType.AUDIO:
        return ErrorTypePb.AUDIO
      case ErrorType.API:
        return ErrorTypePb.API
      default:
        return ErrorTypePb.API
    }
  }

  /**
   * Converts this error to a protobuf ClientError
   */
  toProtobuf(): ClientErrorPb {
    const details: Record<string, string> = {}

    // Convert details to string map
    if (this.details) {
      for (const [key, value] of Object.entries(this.details)) {
        details[key] = String(value)
      }
    }

    return create(ClientErrorSchema, {
      code: this.code,
      type: this.mapErrorTypeToProtobuf(this.type),
      message: this.message,
      provider: this.mapProviderToProtobuf(this.provider),
      details,
    })
  }
}

/**
 * Configuration-related errors
 */
export abstract class ClientConfigurationError extends ClientError {
  readonly type = ErrorType.CONFIGURATION

  constructor(
    message: string,
    provider: ClientProvider,
    details?: Record<string, any>,
  ) {
    super(message, provider, details)
  }
}

/**
 * API key missing or invalid
 */
export class ClientApiKeyError extends ClientConfigurationError {
  readonly code = 'CLIENT_API_KEY_ERROR'

  constructor(provider: ClientProvider) {
    super('API key is required.', provider)
  }
}

/**
 * Required model parameter missing
 */
export class ClientModelError extends ClientConfigurationError {
  readonly code = 'CLIENT_MODEL_ERROR'

  constructor(provider: ClientProvider) {
    super('ASR model is required for transcription.', provider)
  }
}

/**
 * Client availability errors
 */
export class ClientUnavailableError extends ClientError {
  readonly code = 'CLIENT_UNAVAILABLE'
  readonly type = ErrorType.AVAILABILITY

  constructor(provider: ClientProvider) {
    super('Client is not available. Check API key.', provider)
  }
}

/**
 * Audio quality and transcription errors
 */
export abstract class ClientAudioError extends ClientError {
  readonly type = ErrorType.AUDIO

  constructor(
    message: string,
    provider: ClientProvider,
    details?: Record<string, any>,
  ) {
    super(message, provider, details)
  }
}

/**
 * No speech detected in audio
 */
export class ClientNoSpeechError extends ClientAudioError {
  readonly code = 'CLIENT_NO_SPEECH_DETECTED'

  constructor(
    provider: ClientProvider,
    public readonly noSpeechProbability?: number,
  ) {
    super('No speech detected in audio.', provider, { noSpeechProbability })
  }
}

/**
 * Audio transcription quality too low
 */
export class ClientTranscriptionQualityError extends ClientAudioError {
  readonly code = 'CLIENT_TRANSCRIPTION_QUALITY_ERROR'

  constructor(
    provider: ClientProvider,
    public readonly averageLogProbability?: number,
  ) {
    super('Unable to transcribe audio.', provider, { averageLogProbability })
  }
}

/**
 * Audio file too short for transcription
 */
export class ClientAudioTooShortError extends ClientAudioError {
  readonly code = 'CLIENT_AUDIO_TOO_SHORT'

  constructor(provider: ClientProvider) {
    super('Audio file is too short for transcription.', provider, {})
  }
}

/**
 * Client API service errors
 */
export class ClientApiError extends ClientError {
  readonly code = 'CLIENT_API_ERROR'
  readonly type = ErrorType.API

  constructor(
    message: string,
    provider: ClientProvider,
    public readonly originalError?: Error,
    public readonly statusCode?: number,
  ) {
    super(message, provider, {
      originalError: originalError?.message,
      statusCode,
    })
  }
}

/**
 * Type guard to check if an error is a client-related error
 */
export function isClientError(error: unknown): error is ClientError {
  return error instanceof ClientError
}

/**
 * Type guard to check if an error is a specific type of client error
 */
export function isClientErrorType<T extends ClientError>(
  error: unknown,
  ErrorClass: new (...args: any[]) => T,
): error is T {
  return error instanceof ErrorClass
}

/**
 * Converts any error to a protobuf ClientError
 * If it's already a ClientError, converts directly
 * Otherwise, creates a generic API error
 */
export function errorToProtobuf(
  error: unknown,
  provider: ClientProvider = ClientProvider.GROQ,
): ClientErrorPb {
  if (isClientError(error)) {
    return error.toProtobuf()
  }

  // Create a generic API error for unknown errors
  const genericError = new ClientApiError(
    error instanceof Error ? error.message : 'An unknown error occurred',
    provider,
    error instanceof Error ? error : undefined,
  )

  return genericError.toProtobuf()
}
