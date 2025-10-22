import {
  ItoMode,
  TranscribeStreamRequest,
  TranscribeStreamRequestSchema,
  StreamConfigSchema,
  ContextInfoSchema,
  LlmSettingsSchema,
} from '@/app/generated/ito_pb'
import { create } from '@bufbuild/protobuf'
import { grpcClient } from '../clients/grpcClient'
import { AudioStreamManager } from './audio/AudioStreamManager'
import { contextGrabber } from './context/ContextGrabber'
import log from 'electron-log'

/**
 * ItoStreamController manages the lifecycle of a transcription stream using TranscribeStreamV2.
 * It allows sending metadata/config, streaming audio, and updating settings during the stream.
 */
export class ItoStreamController {
  private audioStreamManager = new AudioStreamManager()

  private hasStartedGrpc = false
  private currentMode: ItoMode = ItoMode.TRANSCRIBE
  private isCancelled = false
  private configQueue: TranscribeStreamRequest[] = []
  private abortController: AbortController | null = null

  public async initialize(mode: ItoMode): Promise<boolean> {
    // Guard against multiple concurrent transcriptions
    if (this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoStreamController] Stream already in progress.')
      return false
    }

    this.audioStreamManager.initialize()
    this.hasStartedGrpc = false
    this.currentMode = mode
    this.isCancelled = false
    this.abortController = null
    console.log('[ItoStreamController] Starting new interaction stream.')

    return true
  }

  /**
   * Starts the gRPC stream immediately without waiting for minimum audio duration.
   * Returns a promise that resolves with the transcription response and audio data.
   */
  public async startGrpcStream(): Promise<{
    response: any
    audioBuffer: Buffer
    sampleRate: number
  }> {
    if (this.hasStartedGrpc) {
      log.warn('[ItoStreamController] gRPC stream already started')
      throw new Error('Stream already started')
    }

    console.log('[ItoStreamController] Starting gRPC stream immediately')
    this.hasStartedGrpc = true
    this.abortController = new AbortController()

    const response = await grpcClient.transcribeStreamV2(
      this.createStreamGenerator(),
      this.abortController.signal,
    )

    // Return response along with the audio data collected during the stream
    return {
      response,
      audioBuffer: this.audioStreamManager.getInteractionAudioBuffer(),
      sampleRate: this.audioStreamManager.getCurrentSampleRate(),
    }
  }

  public setMode(mode: ItoMode) {
    if (!this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoStreamController] Cannot change mode - no active stream')
      return
    }

    this.currentMode = mode
    console.log(`[ItoStreamController] Mode changed to ${mode}`)

    // Send mode update to stream
    this.sendModeUpdate(mode)
  }

  public async sendConfigUpdate() {
    if (!this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoStreamController] Cannot send config - no active stream')
      return
    }

    console.log('[ItoStreamController] Queueing config update')
    const config = await this.buildStreamConfig()
    this.configQueue.push(config)
  }

  private sendModeUpdate(mode: ItoMode) {
    console.log(`[ItoStreamController] Sending mode update: ${mode}`)

    // Create a minimal config with just the mode
    // IMPORTANT: Only set the mode field, leave others undefined so server merge works correctly
    const contextInfo = create(ContextInfoSchema, {})
    contextInfo.mode = mode
    // Don't set windowTitle, appName, or contextText - let server keep existing values

    const modeUpdate = create(TranscribeStreamRequestSchema, {
      payload: {
        case: 'config',
        value: create(StreamConfigSchema, {
          context: contextInfo,
        }),
      },
    })

    this.configQueue.push(modeUpdate)
  }

  public endInteraction() {
    if (!this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoStreamController] No active stream to end')
      return
    }

    console.log('[ItoStreamController] Ending interaction stream')
    this.stopStreaming()
  }

  public cancelTranscription() {
    if (!this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoStreamController] No active stream to cancel')
      return
    }

    console.log('[ItoStreamController] Cancelling transcription')
    this.isCancelled = true
    this.abortController?.abort()

    this.stopStreaming()
  }

  public getAudioDurationMs(): number {
    return this.audioStreamManager.getAudioDurationMs()
  }

  private stopStreaming() {
    this.audioStreamManager.stopStreaming()
    this.audioStreamManager.clearInteractionAudio()
  }

  private async *createStreamGenerator(): AsyncGenerator<TranscribeStreamRequest> {
    console.log(
      '[ItoStreamController] Starting stream generator (audio-first mode)',
    )

    // Stream audio chunks and interleave config updates
    for await (const audioChunk of this.audioStreamManager.streamAudioChunks()) {
      if (this.isCancelled) {
        console.log(
          '[ItoStreamController] Stream cancelled, stopping generator',
        )
        break
      }

      // Send any pending config updates before this audio chunk
      while (this.configQueue.length > 0) {
        const configMessage = this.configQueue.shift()!
        console.log('[ItoStreamController] Sending config update from queue')
        yield configMessage
      }

      // Send audio chunk
      yield create(TranscribeStreamRequestSchema, {
        payload: {
          case: 'audioData',
          value: audioChunk.audioData,
        },
      })
    }

    // Send any remaining config messages at the end
    while (this.configQueue.length > 0) {
      const configMessage = this.configQueue.shift()!
      console.log(
        '[ItoStreamController] Sending final config update from queue',
      )
      yield configMessage
    }
  }

  private async buildStreamConfig(): Promise<TranscribeStreamRequest> {
    // Gather all config data using ContextGrabber
    const context = await contextGrabber.gatherContext(this.currentMode)

    return create(TranscribeStreamRequestSchema, {
      payload: {
        case: 'config',
        value: create(StreamConfigSchema, {
          context: create(ContextInfoSchema, {
            windowTitle: context.windowTitle,
            appName: context.appName,
            contextText: context.contextText,
            mode: this.currentMode,
          }),
          llmSettings: create(LlmSettingsSchema, {
            asrModel: context.advancedSettings.llm.asrModel,
            asrProvider: context.advancedSettings.llm.asrProvider,
            asrPrompt: context.advancedSettings.llm.asrPrompt,
            noSpeechThreshold: context.advancedSettings.llm.noSpeechThreshold,
            llmProvider: context.advancedSettings.llm.llmProvider,
            llmModel: context.advancedSettings.llm.llmModel,
            llmTemperature: context.advancedSettings.llm.llmTemperature,
            transcriptionPrompt:
              context.advancedSettings.llm.transcriptionPrompt,
            editingPrompt: context.advancedSettings.llm.editingPrompt,
          }),
          vocabulary: context.vocabularyWords,
        }),
      },
    })
  }
}

export const itoStreamController = new ItoStreamController()
