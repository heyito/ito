/**
 * @deprecated This handler is for the legacy TranscribeStream (V1) endpoint.
 * New clients should use TranscribeStreamV2 (transcribeStreamV2Handler.ts).
 * This implementation is maintained for backwards compatibility with older app versions.
 *
 * Key differences from V2:
 * - Uses gRPC request headers for configuration instead of in-stream StreamConfig messages
 * - Accepts AudioChunk stream instead of TranscribeStreamRequest stream
 * - Does not support progressive config merging or mode grace period
 */

import { create } from '@bufbuild/protobuf'
import { ConnectError } from '@connectrpc/connect'
import type { HandlerContext } from '@connectrpc/connect'
import {
  AudioChunk,
  ItoMode,
  TranscriptionResponseSchema,
} from '../../generated/ito_pb.js'
import { getAsrProvider, getLlmProvider } from '../../clients/providerUtils.js'
import { enhancePcm16 } from '../../utils/audio.js'
import { errorToProtobuf } from '../../clients/errors.js'
import {
  createUserPromptWithContext,
  detectItoMode,
  getAdvancedSettingsHeaders,
  getItoMode,
  getPromptForMode,
} from './helpers.js'
import { ITO_MODE_SYSTEM_PROMPT } from './constants.js'
import type { ItoContext } from './types.js'
import { createWavHeader } from './audioUtils.js'
import { HeaderValidator } from '../../validation/HeaderValidator.js'

/**
 * Legacy handler for TranscribeStream V1 endpoint.
 * @deprecated Maintained for backwards compatibility only.
 */
export class TranscribeStreamHandler {
  async process(
    requests: AsyncIterable<AudioChunk>,
    context: HandlerContext,
  ) {
    const startTime = Date.now()
    const audioChunks: Uint8Array[] = []

    console.log(
      `📩 [${new Date().toISOString()}] Starting transcription stream (V1 - DEPRECATED)`,
    )

    // Process each audio chunk from the stream
    for await (const chunk of requests) {
      audioChunks.push(chunk.audioData)
    }

    console.log(
      `📊 [${new Date().toISOString()}] Processed ${audioChunks.length} audio chunks`,
    )

    // Concatenate all audio chunks
    const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const fullAudio = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of audioChunks) {
      fullAudio.set(chunk, offset)
      offset += chunk.length
    }

    console.log(
      `🔧 [${new Date().toISOString()}] Concatenated audio: ${totalLength} bytes`,
    )

    // Extract settings headers first so they're available in catch block
    const advancedSettingsHeaders = getAdvancedSettingsHeaders(
      context.requestHeader,
    )

    try {
      // 1. Set audio properties to match the new capture settings.
      const sampleRate = 16000 // Correct sample rate
      const bitDepth = 16
      const channels = 1 // Mono

      // 2. Enhance the PCM and create the header with the correct properties.
      const enhancedPcm = enhancePcm16(Buffer.from(fullAudio), sampleRate)
      const wavHeader = createWavHeader(
        enhancedPcm.length,
        sampleRate,
        channels,
        bitDepth,
      )
      const fullAudioWAV = Buffer.concat([wavHeader, enhancedPcm])

      // 3. Extract and validate vocabulary from gRPC metadata
      const vocabularyHeader = context.requestHeader.get('vocabulary')
      const vocabulary = vocabularyHeader
        ? HeaderValidator.validateVocabulary(vocabularyHeader)
        : []

      // 4. Send the corrected WAV file using the selected ASR provider
      const asrProvider = getAsrProvider(advancedSettingsHeaders.asrProvider)
      let transcript = await asrProvider.transcribeAudio(fullAudioWAV, {
        fileType: 'wav',
        asrModel: advancedSettingsHeaders.asrModel,
        noSpeechThreshold: advancedSettingsHeaders.noSpeechThreshold,
        vocabulary,
      })
      console.log(
        `📝 [${new Date().toISOString()}] Received transcript: "${transcript}"`,
      )

      const windowTitle = context.requestHeader.get('window-title') || ''
      const appName = context.requestHeader.get('app-name') || ''
      const mode = getItoMode(context.requestHeader.get('mode'))

      // Decode context text if it was base64 encoded due to Unicode characters
      const rawContextText = context.requestHeader.get('context-text') || ''
      const contextText = rawContextText.startsWith('base64:')
        ? Buffer.from(rawContextText.substring(7), 'base64').toString('utf8')
        : rawContextText

      const windowContext: ItoContext = { windowTitle, appName, contextText }

      const detectedMode = mode || detectItoMode(transcript)
      const userPromptPrefix = getPromptForMode(
        detectedMode,
        advancedSettingsHeaders,
      )
      const userPrompt = createUserPromptWithContext(transcript, windowContext)

      console.log(
        `[${new Date().toISOString()}] Detected mode: ${detectedMode}, adjusting transcript`,
      )

      if (detectedMode === ItoMode.EDIT) {
        const llmProvider = getLlmProvider(
          advancedSettingsHeaders.llmProvider,
        )
        transcript = await llmProvider.adjustTranscript(
          userPromptPrefix + '\n' + userPrompt,
          {
            temperature: advancedSettingsHeaders.llmTemperature,
            model: advancedSettingsHeaders.llmModel,
            prompt: ITO_MODE_SYSTEM_PROMPT[detectedMode],
          },
        )
        console.log(
          `📝 [${new Date().toISOString()}] Adjusted transcript: "${transcript}"`,
        )
      }

      const duration = Date.now() - startTime
      console.log(
        `✅ [${new Date().toISOString()}] Transcription completed in ${duration}ms`,
      )

      return create(TranscriptionResponseSchema, {
        transcript,
      })
    } catch (error: any) {
      // Re-throw ConnectError validation errors - these should bubble up
      if (error instanceof ConnectError) {
        throw error
      }

      console.error('Failed to process transcription via GroqClient:', error)

      // Return structured error response
      return create(TranscriptionResponseSchema, {
        transcript: '',
        error: errorToProtobuf(
          error,
          advancedSettingsHeaders.asrProvider as any,
        ),
      })
    }
  }
}

export const transcribeStreamHandler = new TranscribeStreamHandler()
