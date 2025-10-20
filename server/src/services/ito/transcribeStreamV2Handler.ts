import { create } from '@bufbuild/protobuf'
import { ConnectError } from '@connectrpc/connect'
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

interface ModeChangeRecord {
  mode: ItoMode
  timestamp: number
}

export class TranscribeStreamV2Handler {
  private readonly MODE_CHANGE_GRACE_PERIOD_MS = 100

  async process(requests: AsyncIterable<TranscribeStreamRequest>) {
    const startTime = Date.now()
    const audioChunks: Uint8Array[] = []
    let mergedConfig: StreamConfig = create(StreamConfigSchema, {
      context: undefined,
      transcriptionSettings: undefined,
      llmSettings: undefined,
      vocabulary: [],
    })
    const modeHistory: ModeChangeRecord[] = []

    console.log(`📩 [${new Date().toISOString()}] Starting TranscribeStreamV2`)

    for await (const request of requests) {
      if (request.payload.case === 'audioData') {
        audioChunks.push(request.payload.value)
      } else if (request.payload.case === 'config') {
        const previousMode = mergedConfig.context?.mode
        mergedConfig = this.mergeStreamConfigs(
          mergedConfig,
          request.payload.value,
        )

        console.log(
          `🔧 [${new Date().toISOString()}] Received config update:`,
          JSON.stringify(mergedConfig, null, 2),
        )

        const newMode = mergedConfig.context?.mode
        if (newMode !== undefined && newMode !== previousMode) {
          modeHistory.push({
            mode: newMode,
            timestamp: Date.now(),
          })
          console.log(
            `🔧 [${new Date().toISOString()}] Mode changed to: ${newMode}`,
          )
        }
      }
    }

    const streamEndTime = Date.now()

    let finalMode = mergedConfig.context?.mode
    if (modeHistory.length > 1) {
      const lastModeChange = modeHistory[modeHistory.length - 1]
      const timeSinceLastChange = streamEndTime - lastModeChange.timestamp

      if (timeSinceLastChange <= this.MODE_CHANGE_GRACE_PERIOD_MS) {
        const previousModeRecord = modeHistory[modeHistory.length - 2]
        finalMode = previousModeRecord.mode
        console.log(
          `⏱️ [${new Date().toISOString()}] Last mode change (${timeSinceLastChange}ms ago) within grace period (${this.MODE_CHANGE_GRACE_PERIOD_MS}ms) - reverting from ${lastModeChange.mode} to ${finalMode}`,
        )
      }
    }

    if (finalMode !== undefined && mergedConfig.context) {
      mergedConfig = {
        ...mergedConfig,
        context: {
          ...mergedConfig.context,
          mode: finalMode,
        },
      }
    }

    console.log(
      `📊 [${new Date().toISOString()}] Processed ${audioChunks.length} audio chunks`,
    )

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

    try {
      const sampleRate = 16000
      const bitDepth = 16
      const channels = 1

      const enhancedPcm = enhancePcm16(Buffer.from(fullAudio), sampleRate)
      const wavHeader = createWavHeader(
        enhancedPcm.length,
        sampleRate,
        channels,
        bitDepth,
      )
      const fullAudioWAV = Buffer.concat([wavHeader, enhancedPcm])

      const asrModel =
        mergedConfig.transcriptionSettings?.asrModel ||
        DEFAULT_ADVANCED_SETTINGS.asrModel
      const asrProvider =
        mergedConfig.transcriptionSettings?.asrProvider ||
        DEFAULT_ADVANCED_SETTINGS.asrProvider
      const noSpeechThreshold =
        mergedConfig.transcriptionSettings?.noSpeechThreshold ??
        DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold
      const vocabulary = mergedConfig.vocabulary

      const asrClient = getAsrProvider(asrProvider)
      let transcript = await asrClient.transcribeAudio(fullAudioWAV, {
        fileType: 'wav',
        asrModel,
        noSpeechThreshold,
        vocabulary,
      })
      console.log(
        `📝 [${new Date().toISOString()}] Received transcript: "${transcript}"`,
      )

      const windowContext: ItoContext = {
        windowTitle: mergedConfig.context?.windowTitle || '',
        appName: mergedConfig.context?.appName || '',
        contextText: mergedConfig.context?.contextText || '',
      }

      const mode = mergedConfig.context?.mode ?? detectItoMode(transcript)

      const advancedSettingsHeaders = {
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

      const userPromptPrefix = getPromptForMode(mode, advancedSettingsHeaders)
      const userPrompt = createUserPromptWithContext(transcript, windowContext)

      console.log(
        `[${new Date().toISOString()}] Detected mode: ${mode}, adjusting transcript`,
      )

      if (mode === ItoMode.EDIT) {
        const llmProvider = getLlmProvider(advancedSettingsHeaders.llmProvider)
        transcript = await llmProvider.adjustTranscript(
          userPromptPrefix + '\n' + userPrompt,
          {
            temperature: advancedSettingsHeaders.llmTemperature,
            model: advancedSettingsHeaders.llmModel,
            prompt: ITO_MODE_SYSTEM_PROMPT[mode],
          },
        )
        console.log(
          `📝 [${new Date().toISOString()}] Adjusted transcript: "${transcript}"`,
        )
      }

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
        update.vocabulary.length > 0
          ? [...base.vocabulary, ...update.vocabulary]
          : base.vocabulary,
    }
  }
}

export const transcribeStreamV2Handler = new TranscribeStreamV2Handler()
