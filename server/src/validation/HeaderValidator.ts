import { ConnectError, Code } from '@connectrpc/connect'
import { AsrModelSchema, VocabularySchema } from './schemas.js'

/**
 * Validates gRPC header values using Zod schemas
 */
export class HeaderValidator {
  /**
   * Validates ASR model from header value
   * @throws ConnectError if validation fails
   */
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

  /**
   * Validates vocabulary from header value
   * @throws ConnectError if validation fails
   */
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
