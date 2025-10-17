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
import { WindowMessenger } from './messaging/WindowMessenger'
import { TextInserter } from './text/TextInserter'
import { getCursorContext } from '../media/selected-text-reader'
import { canGetContextFromCurrentApp } from '../utils/applicationDetection'
import { grammarRulesService } from './grammar/GrammarRulesService'
import { DictionaryTable } from './sqlite/repo'
import { getCurrentUserId, getAdvancedSettings } from './store'
import { getActiveWindow } from '../media/active-application'
import { getSelectedTextString } from '../media/selected-text-reader'
import { audioRecorderService } from '../media/audio'
import log from 'electron-log'
import { BrowserWindow } from 'electron'

/**
 * ItoController manages the lifecycle of a transcription stream using TranscribeStreamV2.
 * It allows sending metadata/config, streaming audio, and updating settings during the stream.
 */
export class ItoController {
  private audioStreamManager = new AudioStreamManager()
  private windowMessenger = new WindowMessenger()
  private textInserter = new TextInserter()

  private hasStartedGrpc = false
  private currentMode: ItoMode | null = null
  private isCancelled = false

  public async startInteraction(mode: ItoMode): Promise<boolean> {
    // Guard against multiple concurrent transcriptions
    if (this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoController] Stream already in progress.')
      return false
    }

    this.audioStreamManager.startStreaming()
    this.hasStartedGrpc = false
    this.currentMode = mode
    this.isCancelled = false
    log.info('[ItoController] Starting new interaction stream.')

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
   * Use this when you want to start streaming right away.
   */
  public startGrpcStream() {
    if (this.hasStartedGrpc) {
      log.warn('[ItoController] gRPC stream already started')
      return
    }

    if (this.currentMode === null) {
      log.error('[ItoController] Cannot start gRPC stream - mode not set')
      return
    }

    log.info('[ItoController] Starting gRPC stream immediately')
    this.hasStartedGrpc = true

    // Set up direct audio pipeline
    this.setupAudioListeners()

    grpcClient
      .transcribeStreamV2Raw(this.createStreamGenerator())
      .then(response => {
        if (!this.isCancelled) {
          this.handleTranscriptionResponse(response)
        }
      })
      .catch(error => {
        if (!this.isCancelled) {
          this.handleTranscriptionError(error)
        }
      })
      .finally(() => {
        this.cleanupAudioListeners()
      })
  }

  private setupAudioListeners() {
    log.info('[ItoController] Setting up direct audio listeners')

    audioRecorderService.on('audio-chunk', this.handleAudioChunk)
    audioRecorderService.on('audio-config', this.handleAudioConfig)
  }

  private cleanupAudioListeners() {
    log.info('[ItoController] Cleaning up audio listeners')

    audioRecorderService.off('audio-chunk', this.handleAudioChunk)
    audioRecorderService.off('audio-config', this.handleAudioConfig)
  }

  private handleAudioChunk = (chunk: Buffer) => {
    log.info(`[ItoController] Received audio chunk: ${chunk.length} bytes`)
    this.audioStreamManager.addAudioChunk(chunk)
  }

  private handleAudioConfig = ({ outputSampleRate, sampleRate }: any) => {
    const effectiveRate = outputSampleRate || sampleRate || 16000
    log.info('[ItoController] Received audio config:', {
      outputSampleRate,
      sampleRate,
      effectiveRate,
    })
    this.audioStreamManager.setAudioConfig({ sampleRate: effectiveRate })
  }

  public changeMode(mode: ItoMode) {
    if (!this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoController] Cannot change mode - no active stream')
      return
    }

    this.currentMode = mode
    log.info(`[ItoController] Mode changed to ${mode}`)
  }

  public endInteraction() {
    if (!this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoController] No active stream to end')
      return
    }

    log.info('[ItoController] Ending interaction stream')
    this.stopStreaming()
  }

  public cancelTranscription() {
    if (!this.audioStreamManager.isCurrentlyStreaming()) {
      log.warn('[ItoController] No active stream to cancel')
      return
    }

    log.info('[ItoController] Cancelling transcription')
    this.isCancelled = true

    // Clear interaction without creating it
    if (!this.hasStartedGrpc) {
      interactionManager.clearCurrentInteraction()
    }

    this.stopStreaming()
    this.audioStreamManager.clearInteractionAudio()
  }

  public setMainWindow(mainWindow: BrowserWindow | null) {
    this.windowMessenger.setMainWindow(mainWindow)
  }

  public getAudioDurationMs(): number {
    return this.audioStreamManager.getAudioDurationMs()
  }

  private stopStreaming() {
    this.audioStreamManager.stopStreaming()
  }

  private async *createStreamGenerator(): AsyncGenerator<TranscribeStreamRequest> {
    // Send initial config
    const initialConfig = await this.buildStreamConfig()
    yield initialConfig
    log.info('[ItoController] Sent initial config')

    // Stream audio chunks
    for await (const audioChunk of this.audioStreamManager.streamAudioChunks()) {
      if (this.isCancelled) {
        log.info('[ItoController] Stream cancelled, stopping generator')
        break
      }

      // Send audio chunk
      yield create(TranscribeStreamRequestSchema, {
        payload: {
          case: 'audioData',
          value: audioChunk.audioData,
        },
      })
    }

    log.info('[ItoController] Stream generator completed')
  }

  private async buildStreamConfig(): Promise<TranscribeStreamRequest> {
    // Gather all config data
    const userId = getCurrentUserId()
    const dictionaryItems = await DictionaryTable.findAll(userId)
    const vocabularyWords = dictionaryItems
      .filter(item => item.deleted_at === null)
      .map(item => item.word)

    const windowContext = await getActiveWindow()
    const advancedSettings = getAdvancedSettings()

    let contextText = ''
    try {
      if (this.currentMode === ItoMode.EDIT) {
        const text = await getSelectedTextString(10000)
        if (text && text.trim().length > 0) {
          contextText = text
        }
      }
    } catch (error) {
      log.error('[ItoController] Error getting context text:', error)
    }

    return create(TranscribeStreamRequestSchema, {
      payload: {
        case: 'config',
        value: create(StreamConfigSchema, {
          context: create(ContextInfoSchema, {
            windowTitle: windowContext?.title || '',
            appName: windowContext?.appName || '',
            contextText,
            mode: this.currentMode!,
          }),
          transcriptionSettings: create(TranscriptionSettingsSchema, {
            asrModel: advancedSettings.llm.asrModel,
            asrProvider: advancedSettings.llm.asrProvider,
            asrPrompt: advancedSettings.llm.asrPrompt,
            noSpeechThreshold: advancedSettings.llm.noSpeechThreshold,
            lowQualityThreshold: advancedSettings.llm.lowQualityThreshold,
          }),
          llmSettings: create(LlmSettingsSchema, {
            llmProvider: advancedSettings.llm.llmProvider,
            llmModel: advancedSettings.llm.llmModel,
            llmTemperature: advancedSettings.llm.llmTemperature,
            transcriptionPrompt: advancedSettings.llm.transcriptionPrompt,
            editingPrompt: advancedSettings.llm.editingPrompt,
            asrModel: '',
            asrProvider: '',
            asrPrompt: '',
            noSpeechThreshold: 0,
            lowQualityThreshold: 0,
          }),
          vocabulary: vocabularyWords,
        }),
      },
    })
  }

  private async handleTranscriptionResponse(response: any) {
    log.info('[ItoController] Processing transcription response:', {
      transcript: response.transcript,
      transcriptLength: response.transcript?.length || 0,
      hasTranscript: !!response.transcript,
      hasError: !!response.error,
      errorCode: response.error?.code,
      interactionId: interactionManager.getCurrentInteractionId(),
    })

    const errorMessage = response.error ? response.error.message : undefined

    // Handle any transcription error
    if (response.error) {
      await interactionManager.createInteraction(
        response.transcript || '',
        this.audioStreamManager.getInteractionAudioBuffer(),
        this.audioStreamManager.getCurrentSampleRate(),
        errorMessage,
      )

      this.audioStreamManager.clearInteractionAudio()
      interactionManager.clearCurrentInteraction()
    } else {
      // Handle text insertion with grammar-corrected text
      if (response.transcript && !response.error) {
        const contextLength = 4
        const canGetContext = await canGetContextFromCurrentApp()
        let cursorContext: string | undefined
        try {
          cursorContext = canGetContext
            ? await getCursorContext(contextLength)
            : ''
        } catch (e) {
          log.error('Cursor context failed:', e)
        }

        // Apply grammar rules with cursor context
        const context = cursorContext || ''
        let correctedText = grammarRulesService.setCaseFirstWord(
          context,
          response.transcript,
        )
        correctedText = grammarRulesService.addLeadingSpaceIfNeeded(
          context,
          correctedText,
        )

        await this.textInserter.insertText(correctedText)

        // Create interaction in database
        await interactionManager.createInteraction(
          response.transcript,
          this.audioStreamManager.getInteractionAudioBuffer(),
          this.audioStreamManager.getCurrentSampleRate(),
          errorMessage,
        )
      }

      // Send transcription result to main window
      this.windowMessenger.sendTranscriptionResult(response)

      this.audioStreamManager.clearInteractionAudio()
      interactionManager.clearCurrentInteraction()
    }
  }

  private async handleTranscriptionError(error: any) {
    log.error(
      '[ItoController] An unexpected error occurred during transcription:',
      error,
    )

    // Send transcription error to main window
    this.windowMessenger.sendTranscriptionError(error)

    // Clear current interaction on error
    interactionManager.clearCurrentInteraction()
    this.audioStreamManager.clearInteractionAudio()
  }
}

export const itoController = new ItoController()
