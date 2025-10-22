import { create } from '@bufbuild/protobuf'
import { ConnectError, Code } from '@connectrpc/connect'
import type { HandlerContext } from '@connectrpc/connect'
import {
  ContextInfo,
  ItoMode,
  StreamConfig,
  StreamConfigSchema,
  TranscribeStreamRequest,
  TranscriptionResponseSchema,
} from '../../generated/ito_pb.js'
import { getAsrProvider, getLlmProvider } from '../../clients/providerUtils.js'
import { enhancePcm16 } from '../../utils/audio.js'
import { DEFAULT_ADVANCED_SETTINGS } from '../../constants/generated-defaults.js'
import { errorToProtobuf } from '../../clients/errors.js'
import {
  createUserPromptWithContext,
  detectItoMode,
  getPromptForMode,
} from './helpers.js'
import { ITO_MODE_SYSTEM_PROMPT } from './constants.js'
import type { ItoContext } from './types.js'
import { createWavHeader } from './audioUtils.js'

export class TranscribeStreamV2Handler {
  private readonly MODE_CHANGE_GRACE_PERIOD_MS = 100

  async process(
    requests: AsyncIterable<TranscribeStreamRequest>,
    context?: HandlerContext,
  ) {
    const startTime = Date.now()

    console.log(`📩 [${new Date().toISOString()}] Starting TranscribeStreamV2`)

    // Collect stream data
    const {
      audioChunks,
      mergedConfig: initialConfig,
      lastModeChangeTimestamp,
      previousMode,
    } = await this.collectStreamData(requests)

    const streamEndTime = Date.now()

    // Check if client cancelled the stream
    if (context?.signal.aborted) {
      console.log(
        `🚫 [${new Date().toISOString()}] Stream cancelled by client, aborting processing`,
      )
      throw new ConnectError('Stream cancelled by client', Code.Canceled)
    }

    // Apply mode grace period
    const mergedConfig = this.applyModeGracePeriod(
      initialConfig,
      lastModeChangeTimestamp,
      previousMode,
      streamEndTime,
    )

    console.log(
      `📊 [${new Date().toISOString()}] Processed ${audioChunks.length} audio chunks`,
    )

    // Concatenate and prepare audio
    const fullAudio = this.concatenateAudioChunks(audioChunks)

    try {
      const fullAudioWAV = this.prepareAudioForTranscription(fullAudio)

      // Extract configuration
      const asrConfig = this.extractAsrConfig(mergedConfig)

      // Transcribe audio
      let transcript = await this.transcribeAudioData(
        fullAudioWAV,
        asrConfig,
        context,
      )

      // Prepare context and settings
      const windowContext: ItoContext = {
        windowTitle: mergedConfig.context?.windowTitle || '',
        appName: mergedConfig.context?.appName || '',
        contextText: mergedConfig.context?.contextText || '',
      }

      const mode = mergedConfig.context?.mode ?? detectItoMode(transcript)

      const advancedSettings = this.prepareAdvancedSettings(
        mergedConfig,
        asrConfig.asrModel,
        asrConfig.asrProvider,
        asrConfig.noSpeechThreshold,
      )

      // Adjust transcript based on mode
      transcript = await this.adjustTranscriptForMode(
        transcript,
        mode,
        windowContext,
        advancedSettings,
      )

      const duration = Date.now() - startTime
      console.log(
        `✅ [${new Date().toISOString()}] TranscribeStreamV2 completed in ${duration}ms`,
      )

      return create(TranscriptionResponseSchema, {
        transcript,
      })
    } catch (error: any) {
      if (error instanceof ConnectError) {
        throw error
      }

      console.error('Failed to process TranscribeStreamV2:', error)

      return create(TranscriptionResponseSchema, {
        transcript: '',
        error: errorToProtobuf(
          error,
          (mergedConfig.transcriptionSettings?.asrProvider as any) ||
            (DEFAULT_ADVANCED_SETTINGS.asrProvider as any),
        ),
      })
    }
  }

  private async collectStreamData(
    requests: AsyncIterable<TranscribeStreamRequest>,
  ): Promise<{
    audioChunks: Uint8Array[]
    mergedConfig: StreamConfig
    lastModeChangeTimestamp: number | null
    previousMode: ItoMode | undefined
  }> {
    const audioChunks: Uint8Array[] = []
    let mergedConfig: StreamConfig = create(StreamConfigSchema, {
      context: undefined,
      transcriptionSettings: undefined,
      llmSettings: undefined,
      vocabulary: [],
    })
    let lastModeChangeTimestamp: number | null = null
    let previousMode: ItoMode | undefined = undefined

    try {
      for await (const request of requests) {
        if (request.payload.case === 'audioData') {
          audioChunks.push(request.payload.value)
        } else if (request.payload.case === 'config') {
          const currentMode = mergedConfig.context?.mode
          mergedConfig = this.mergeStreamConfigs(
            mergedConfig,
            request.payload.value,
          )

          console.log(
            `🔧 [${new Date().toISOString()}] Received config update:`,
            JSON.stringify(mergedConfig, null, 2),
          )

          const newMode = mergedConfig.context?.mode
          if (newMode !== undefined && newMode !== currentMode) {
            previousMode = currentMode
            lastModeChangeTimestamp = Date.now()
            console.log(
              `🔧 [${new Date().toISOString()}] Mode changed from ${currentMode} to: ${newMode}`,
            )
          }
        }
      }
    } catch (err) {
      const isAbortError =
        err instanceof Error &&
        (err.message === 'aborted' ||
          (err as any).code === 'ECONNRESET' ||
          (err as any).code === 'ABORT_ERR')

      if (isAbortError) {
        console.log(
          `🚫 [${new Date().toISOString()}] Stream reading interrupted (client cancelled)`,
        )
        throw new ConnectError(
          'Stream cancelled by client',
          Code.Canceled,
          undefined,
          undefined,
          err,
        )
      }

      throw err
    }

    return { audioChunks, mergedConfig, lastModeChangeTimestamp, previousMode }
  }

  private applyModeGracePeriod(
    mergedConfig: StreamConfig,
    lastModeChangeTimestamp: number | null,
    previousMode: ItoMode | undefined,
    streamEndTime: number,
  ): StreamConfig {
    // If there was a mode change and it happened within the grace period,
    // revert to the previous mode (or undefined if no previous mode)
    if (lastModeChangeTimestamp !== null) {
      const timeSinceLastChange = streamEndTime - lastModeChangeTimestamp

      if (timeSinceLastChange <= this.MODE_CHANGE_GRACE_PERIOD_MS) {
        const currentMode = mergedConfig.context?.mode
        console.log(
          `⏱️ [${new Date().toISOString()}] Last mode change (${timeSinceLastChange}ms ago) within grace period (${this.MODE_CHANGE_GRACE_PERIOD_MS}ms) - reverting from ${currentMode} to ${previousMode}`,
        )

        if (mergedConfig.context) {
          return {
            ...mergedConfig,
            context: {
              ...mergedConfig.context,
              mode: previousMode,
            },
          }
        }
      }
    }

    return mergedConfig
  }

  private concatenateAudioChunks(audioChunks: Uint8Array[]): Uint8Array {
    const totalLength = audioChunks.reduce(
      (sum, chunk) => sum + chunk.length,
      0,
    )
    const fullAudio = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of audioChunks) {
      fullAudio.set(chunk, offset)
      offset += chunk.length
    }

    console.log(
      `🔧 [${new Date().toISOString()}] Concatenated audio: ${totalLength} bytes`,
    )

    return fullAudio
  }

  private prepareAudioForTranscription(audioData: Uint8Array): Buffer {
    const sampleRate = 16000
    const bitDepth = 16
    const channels = 1

    const enhancedPcm = enhancePcm16(Buffer.from(audioData), sampleRate)
    const wavHeader = createWavHeader(
      enhancedPcm.length,
      sampleRate,
      channels,
      bitDepth,
    )

    return Buffer.concat([wavHeader, enhancedPcm])
  }

  private extractAsrConfig(mergedConfig: StreamConfig) {
    return {
      asrModel:
        mergedConfig.transcriptionSettings?.asrModel ||
        DEFAULT_ADVANCED_SETTINGS.asrModel,
      asrProvider:
        mergedConfig.transcriptionSettings?.asrProvider ||
        DEFAULT_ADVANCED_SETTINGS.asrProvider,
      noSpeechThreshold:
        mergedConfig.transcriptionSettings?.noSpeechThreshold ??
        DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold,
      vocabulary: mergedConfig.vocabulary,
    }
  }

  private prepareAdvancedSettings(
    mergedConfig: StreamConfig,
    asrModel: string,
    asrProvider: string,
    noSpeechThreshold: number,
  ) {
    return {
      asrModel,
      asrProvider,
      asrPrompt:
        mergedConfig.transcriptionSettings?.asrPrompt ||
        DEFAULT_ADVANCED_SETTINGS.asrPrompt,
      llmProvider:
        mergedConfig.llmSettings?.llmProvider ||
        DEFAULT_ADVANCED_SETTINGS.llmProvider,
      llmModel:
        mergedConfig.llmSettings?.llmModel ||
        DEFAULT_ADVANCED_SETTINGS.llmModel,
      llmTemperature:
        mergedConfig.llmSettings?.llmTemperature ??
        DEFAULT_ADVANCED_SETTINGS.llmTemperature,
      transcriptionPrompt:
        mergedConfig.llmSettings?.transcriptionPrompt ||
        DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
      editingPrompt:
        mergedConfig.llmSettings?.editingPrompt ||
        DEFAULT_ADVANCED_SETTINGS.editingPrompt,
      noSpeechThreshold,
    }
  }

  private async transcribeAudioData(
    audioWav: Buffer,
    asrConfig: ReturnType<typeof this.extractAsrConfig>,
    context?: HandlerContext,
  ): Promise<string> {
    if (context?.signal.aborted) {
      console.log(
        `🚫 [${new Date().toISOString()}] Stream cancelled before ASR call, skipping transcription`,
      )
      throw new ConnectError('Stream cancelled by client', Code.Canceled)
    }

    const asrClient = getAsrProvider(asrConfig.asrProvider)
    const transcript = await asrClient.transcribeAudio(audioWav, {
      fileType: 'wav',
      asrModel: asrConfig.asrModel,
      noSpeechThreshold: asrConfig.noSpeechThreshold,
      vocabulary: asrConfig.vocabulary,
    })

    console.log(
      `📝 [${new Date().toISOString()}] Received transcript: "${transcript}"`,
    )

    return transcript
  }

  private async adjustTranscriptForMode(
    transcript: string,
    mode: ItoMode,
    windowContext: ItoContext,
    advancedSettings: ReturnType<typeof this.prepareAdvancedSettings>,
  ): Promise<string> {
    console.log(
      `[${new Date().toISOString()}] Detected mode: ${mode}, adjusting transcript`,
    )

    if (mode !== ItoMode.EDIT) {
      return transcript
    }

    const userPromptPrefix = getPromptForMode(mode, advancedSettings)
    const userPrompt = createUserPromptWithContext(transcript, windowContext)
    const llmProvider = getLlmProvider(advancedSettings.llmProvider)

    const adjustedTranscript = await llmProvider.adjustTranscript(
      userPromptPrefix + '\n' + userPrompt,
      {
        temperature: advancedSettings.llmTemperature,
        model: advancedSettings.llmModel,
        prompt: ITO_MODE_SYSTEM_PROMPT[mode],
      },
    )

    console.log(
      `📝 [${new Date().toISOString()}] Adjusted transcript: "${adjustedTranscript}"`,
    )

    return adjustedTranscript
  }

  private mergeStreamConfigs(
    base: StreamConfig,
    update: StreamConfig,
  ): StreamConfig {
    const mergeContext = (
      baseCtx: ContextInfo | undefined,
      updateCtx: ContextInfo | undefined,
    ): ContextInfo | undefined => {
      if (!updateCtx) return baseCtx
      if (!baseCtx) return updateCtx

      return {
        ...baseCtx,
        mode: updateCtx.mode !== undefined ? updateCtx.mode : baseCtx.mode,
        windowTitle:
          updateCtx.windowTitle !== ''
            ? updateCtx.windowTitle
            : baseCtx.windowTitle,
        appName: updateCtx.appName !== '' ? updateCtx.appName : baseCtx.appName,
        contextText:
          updateCtx.contextText !== ''
            ? updateCtx.contextText
            : baseCtx.contextText,
      }
    }

    return {
      ...base,
      context: mergeContext(base.context, update.context),
      transcriptionSettings: update.transcriptionSettings
        ? { ...base.transcriptionSettings, ...update.transcriptionSettings }
        : base.transcriptionSettings,
      llmSettings: update.llmSettings
        ? { ...base.llmSettings, ...update.llmSettings }
        : base.llmSettings,
      vocabulary:
        update.vocabulary.length > 0 ? update.vocabulary : base.vocabulary,
    }
  }
}

export const transcribeStreamV2Handler = new TranscribeStreamV2Handler()
