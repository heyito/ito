import {
  ItoMode,
  TranscribeStreamRequest,
  TranscribeStreamRequestSchema,
  StreamConfigSchema,
  ContextInfoSchema,
  TranscriptionSettingsSchema,
  LlmSettingsSchema,
} from '@/app/generated/ito_pb'
import { create } from '@bufbuild/protobuf'
import { grpcClient } from '../clients/grpcClient'
import { AudioStreamManager } from './audio/AudioStreamManager'
import { interactionManager } from './interactions/InteractionManager'
import { contextGrabber } from './context/ContextGrabber'
import { audioRecorderService } from '../media/audio'
import log from 'electron-log'

/**
 * ItoStreamController manages the lifecycle of a transcription stream using TranscribeStreamV2.
 * It allows sending metadata/config, streaming audio, and updating settings during the stream.
 */
export class ItoStreamController {
  private audioStreamManager = new AudioStreamManager()

  private hasStartedGrpc = false
  private currentMode: ItoMode | null = null
  private isCancelled = false
  private configQueue: TranscribeStreamRequest[] = []

  constructor() {
    // Set up audio listeners once - they remain active for the lifetime of the controller
    // The AudioStreamManager's isStreaming flag gates whether chunks are processed
    this.setupAudioListeners()
  }

  public async startInteraction(mode: ItoMode): Promise<boolean> {
    // Guard against multiple concurrent transcriptions
    if (this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoStreamController] Stream already in progress.')
      return false
    }

    this.audioStreamManager.startStreaming()
    this.hasStartedGrpc = false
    this.currentMode = mode
    this.isCancelled = false
    log.info('[ItoStreamController] Starting new interaction stream.')

    // Reuse existing global interaction ID if present, otherwise create a new one
    const existingId = interactionManager.getCurrentInteractionId()
    if (existingId) {
      interactionManager.adoptInteractionId(existingId)
    } else {
      interactionManager.startInteraction()
    }

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

    if (this.currentMode === null) {
      log.error('[ItoStreamController] Cannot start gRPC stream - mode not set')
      throw new Error('Mode not set')
    }

    log.info('[ItoStreamController] Starting gRPC stream immediately')
    this.hasStartedGrpc = true

    const response = await grpcClient.transcribeStreamV2(
      this.createStreamGenerator(),
    )

    if (this.isCancelled) {
      throw new Error('Transcription was cancelled')
    }

    // Return response along with the audio data collected during the stream
    return {
      response,
      audioBuffer: this.audioStreamManager.getInteractionAudioBuffer(),
      sampleRate: this.audioStreamManager.getCurrentSampleRate(),
    }
  }

  private setupAudioListeners() {
    log.info('[ItoStreamController] Setting up direct audio listeners')

    audioRecorderService.on('audio-chunk', this.handleAudioChunk)
    audioRecorderService.on('audio-config', this.handleAudioConfig)
  }

  private cleanupAudioListeners() {
    log.info('[ItoStreamController] Cleaning up audio listeners')

    audioRecorderService.off('audio-chunk', this.handleAudioChunk)
    audioRecorderService.off('audio-config', this.handleAudioConfig)
  }

  private handleAudioChunk = (chunk: Buffer) => {
    this.audioStreamManager.addAudioChunk(chunk)
  }

  private handleAudioConfig = ({ outputSampleRate, sampleRate }: any) => {
    const effectiveRate = outputSampleRate || sampleRate || 16000
    log.info('[ItoStreamController] Received audio config:', {
      outputSampleRate,
      sampleRate,
      effectiveRate,
    })
    this.audioStreamManager.setAudioConfig({ sampleRate: effectiveRate })
  }

  public setMode(mode: ItoMode) {
    if (!this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoStreamController] Cannot change mode - no active stream')
      return
    }

    this.currentMode = mode
    log.info(`[ItoStreamController] Mode changed to ${mode}`)

    // Send mode update to stream
    this.sendModeUpdate(mode)
  }

  public async sendConfigUpdate() {
    if (!this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoStreamController] Cannot send config - no active stream')
      return
    }

    log.info('[ItoStreamController] Queueing config update')
    const config = await this.buildStreamConfig()
    this.configQueue.push(config)
  }

  private sendModeUpdate(mode: ItoMode) {
    log.info(`[ItoStreamController] Sending mode update: ${mode}`)

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

    log.info('[ItoStreamController] Ending interaction stream')
    this.stopStreaming()
  }

  public cancelTranscription() {
    if (!this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoStreamController] No active stream to cancel')
      return
    }

    log.info('[ItoStreamController] Cancelling transcription')
    this.isCancelled = true

    // Clear interaction without creating it
    if (!this.hasStartedGrpc) {
      interactionManager.clearCurrentInteraction()
    }

    this.stopStreaming()
    this.audioStreamManager.clearInteractionAudio()
  }

  public getAudioDurationMs(): number {
    return this.audioStreamManager.getAudioDurationMs()
  }

  public clearInteractionAudio(): void {
    this.audioStreamManager.clearInteractionAudio()
  }

  private stopStreaming() {
    this.audioStreamManager.stopStreaming()
  }

  private async *createStreamGenerator(): AsyncGenerator<TranscribeStreamRequest> {
    log.info(
      '[ItoStreamController] Starting stream generator (audio-first mode)',
    )

    // Stream audio chunks and interleave config updates
    for await (const audioChunk of this.audioStreamManager.streamAudioChunks()) {
      if (this.isCancelled) {
        log.info('[ItoStreamController] Stream cancelled, stopping generator')
        break
      }

      // Send any pending config updates before this audio chunk
      while (this.configQueue.length > 0) {
        const configMessage = this.configQueue.shift()!
        log.info('[ItoStreamController] Sending config update from queue')
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
      log.info('[ItoStreamController] Sending final config update from queue')
      yield configMessage
    }
  }

  private async buildStreamConfig(): Promise<TranscribeStreamRequest> {
    // Gather all config data using ContextGrabber
    const context = await contextGrabber.gatherContext(this.currentMode!)

    return create(TranscribeStreamRequestSchema, {
      payload: {
        case: 'config',
        value: create(StreamConfigSchema, {
          context: create(ContextInfoSchema, {
            windowTitle: context.windowTitle,
            appName: context.appName,
            contextText: context.contextText,
            mode: this.currentMode!,
          }),
          transcriptionSettings: create(TranscriptionSettingsSchema, {
            asrModel: context.advancedSettings.llm.asrModel,
            asrProvider: context.advancedSettings.llm.asrProvider,
            asrPrompt: context.advancedSettings.llm.asrPrompt,
            noSpeechThreshold: context.advancedSettings.llm.noSpeechThreshold,
          }),
          llmSettings: create(LlmSettingsSchema, {
            llmProvider: context.advancedSettings.llm.llmProvider,
            llmModel: context.advancedSettings.llm.llmModel,
            llmTemperature: context.advancedSettings.llm.llmTemperature,
            transcriptionPrompt:
              context.advancedSettings.llm.transcriptionPrompt,
            editingPrompt: context.advancedSettings.llm.editingPrompt,
            asrModel: '',
            asrProvider: '',
            asrPrompt: '',
            noSpeechThreshold: 0,
          }),
          vocabulary: context.vocabularyWords,
        }),
      },
    })
  }
}

export const itoStreamController = new ItoStreamController()
