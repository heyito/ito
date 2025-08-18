import type { ConnectRouter } from '@connectrpc/connect'
import {
  AudioChunk,
  TranscriptionResponseSchema,
  ItoService as ItoServiceDesc,
  Note,
  NoteSchema,
  Interaction,
  InteractionSchema,
  DictionaryItem,
  DictionaryItemSchema,
  AdvancedSettings,
  AdvancedSettingsSchema,
  LlmSettingsSchema,
  ItoMode,
} from '../../generated/ito_pb.js'
import { create } from '@bufbuild/protobuf'
import type { HandlerContext } from '@connectrpc/connect'
import { groqClient } from '../../clients/groqClient.js'
import {
  DictionaryRepository,
  InteractionsRepository,
  NotesRepository,
  AdvancedSettingsRepository,
} from '../../db/repo.js'
import {
  Note as DbNote,
  Interaction as DbInteraction,
  DictionaryItem as DbDictionaryItem,
  AdvancedSettings as DbAdvancedSettings,
} from '../../db/models.js'
import { ConnectError, Code } from '@connectrpc/connect'
import { kUser } from '../../auth/userContext.js'
import { WindowContext } from './types.js'
import { HeaderValidator } from '../../validation/HeaderValidator.js'
import { errorToProtobuf } from '../../clients/errors.js'
import { ClientProvider } from '../../clients/providers.js'
import {
  addContextToPrompt,
  getAdvancedSettingsHeaders,
  detectItoMode,
  getPromptForMode,
  getItoMode,
} from './helpers.js'

/**
 * --- NEW: WAV Header Generation Function ---
 * Creates a 44-byte WAV header for raw PCM audio data.
 * @param dataLength The length of the raw audio data in bytes.
 * @param sampleRate The sample rate (e.g., 44100).
 * @param channelCount The number of channels (1 for mono, 2 for stereo).
 * @param bitDepth The bit depth (e.g., 16).
 * @returns A Buffer containing the WAV header.
 */
function createWavHeader(
  dataLength: number,
  sampleRate: number,
  channelCount: number,
  bitDepth: number,
): Buffer {
  const header = Buffer.alloc(44)

  // RIFF chunk descriptor
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLength, 4) // ChunkSize
  header.write('WAVE', 8)

  // "fmt " sub-chunk
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20) // AudioFormat (1 for PCM)
  header.writeUInt16LE(channelCount, 22)
  header.writeUInt32LE(sampleRate, 24)

  const blockAlign = channelCount * (bitDepth / 8)
  const byteRate = sampleRate * blockAlign

  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitDepth, 34)

  // "data" sub-chunk
  header.write('data', 36)
  header.writeUInt32LE(dataLength, 40)

  return header
}

function dbToNotePb(dbNote: DbNote): Note {
  return create(NoteSchema, {
    id: dbNote.id,
    userId: dbNote.user_id,
    interactionId: dbNote.interaction_id ?? '',
    content: dbNote.content,
    createdAt: dbNote.created_at.toISOString(),
    updatedAt: dbNote.updated_at.toISOString(),
    deletedAt: dbNote.deleted_at?.toISOString() ?? '',
  })
}

function dbToInteractionPb(dbInteraction: DbInteraction): Interaction {
  return create(InteractionSchema, {
    id: dbInteraction.id,
    userId: dbInteraction.user_id ?? '',
    title: dbInteraction.title ?? '',
    asrOutput: dbInteraction.asr_output
      ? JSON.stringify(dbInteraction.asr_output)
      : '',
    llmOutput: dbInteraction.llm_output
      ? JSON.stringify(dbInteraction.llm_output)
      : '',
    rawAudio: dbInteraction.raw_audio
      ? new Uint8Array(dbInteraction.raw_audio)
      : new Uint8Array(0),
    durationMs: dbInteraction.duration_ms ?? 0,
    createdAt: dbInteraction.created_at.toISOString(),
    updatedAt: dbInteraction.updated_at.toISOString(),
    deletedAt: dbInteraction.deleted_at?.toISOString() ?? '',
  })
}

function dbToDictionaryItemPb(
  dbDictionaryItem: DbDictionaryItem,
): DictionaryItem {
  return create(DictionaryItemSchema, {
    id: dbDictionaryItem.id,
    userId: dbDictionaryItem.user_id,
    word: dbDictionaryItem.word,
    pronunciation: dbDictionaryItem.pronunciation ?? '',
    createdAt: dbDictionaryItem.created_at.toISOString(),
    updatedAt: dbDictionaryItem.updated_at.toISOString(),
    deletedAt: dbDictionaryItem.deleted_at?.toISOString() ?? '',
  })
}

function dbToAdvancedSettingsPb(
  dbAdvancedSettings: DbAdvancedSettings,
): AdvancedSettings {
  return create(AdvancedSettingsSchema, {
    id: dbAdvancedSettings.id,
    userId: dbAdvancedSettings.user_id,
    createdAt: dbAdvancedSettings.created_at.toISOString(),
    updatedAt: dbAdvancedSettings.updated_at.toISOString(),
    llm: create(LlmSettingsSchema, {
      asrModel: dbAdvancedSettings.llm.asr_model,
      asrPrompt: dbAdvancedSettings.llm.asr_prompt,
      asrProvider: dbAdvancedSettings.llm.asr_provider,
      llmProvider: dbAdvancedSettings.llm.llm_provider,
      llmTemperature: dbAdvancedSettings.llm.llm_temperature,
      llmModel: dbAdvancedSettings.llm.llm_model,
      transcriptionPrompt: dbAdvancedSettings.llm.transcription_prompt,
      editingPrompt: dbAdvancedSettings.llm.editing_prompt,
      noSpeechThreshold: dbAdvancedSettings.llm.no_speech_threshold,
      lowQualityThreshold: dbAdvancedSettings.llm.low_quality_threshold,
    }),
  })
}

// Export the service implementation as a function that takes a ConnectRouter
export default (router: ConnectRouter) => {
  router.service(ItoServiceDesc, {
    async transcribeStream(
      requests: AsyncIterable<AudioChunk>,
      context: HandlerContext,
    ) {
      const startTime = Date.now()
      const audioChunks: Uint8Array[] = []

      console.log(
        `📩 [${new Date().toISOString()}] Starting transcription stream`,
      )

      // Process each audio chunk from the stream
      for await (const chunk of requests) {
        audioChunks.push(chunk.audioData)
      }

      console.log(
        `📊 [${new Date().toISOString()}] Processed ${audioChunks.length} audio chunks`,
      )

      // Concatenate all audio chunks
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
        // 1. Set audio properties to match the new capture settings.
        const sampleRate = 16000 // Correct sample rate
        const bitDepth = 16
        const channels = 1 // Mono

        // 2. Create the header with the correct properties.
        const wavHeader = createWavHeader(
          fullAudio.length,
          sampleRate,
          channels,
          bitDepth,
        )
        const fullAudioWAV = Buffer.concat([wavHeader, fullAudio])

        // 3. Extract and validate vocabulary and ASR model from gRPC metadata
        const vocabularyHeader = context.requestHeader.get('vocabulary')
        const vocabulary = vocabularyHeader
          ? HeaderValidator.validateVocabulary(vocabularyHeader)
          : []

        const advancedSettingsHeaders = getAdvancedSettingsHeaders(
          context.requestHeader,
        )

        // 4. Send the corrected WAV file using the validated ASR model from headers.
        let transcript = await groqClient.transcribeAudio(
          fullAudioWAV,
          'wav',
          advancedSettingsHeaders.asrModel,
          advancedSettingsHeaders.noSpeechThreshold,
          advancedSettingsHeaders.lowQualityThreshold,
          advancedSettingsHeaders.asrPrompt,
          vocabulary,
        )
        console.log(
          `📝 [${new Date().toISOString()}] Received transcript: "${transcript}"`,
        )

        const windowTitle = context.requestHeader.get('window-title') || ''
        const appName = context.requestHeader.get('app-name') || ''
        const mode = getItoMode(context.requestHeader.get('mode'))

        const windowContext: WindowContext = { windowTitle, appName }

        const detectedMode = mode || detectItoMode(transcript)
        const preContextPrompt = getPromptForMode(
          detectedMode,
          advancedSettingsHeaders,
        )
        const systemPrompt = addContextToPrompt(preContextPrompt, windowContext)

        console.log(
          `[${new Date().toISOString()}] Detected mode: ${detectedMode}, adjusting transcript`,
        )

        transcript = await groqClient.adjustTranscript(
          transcript,
          advancedSettingsHeaders.llmTemperature,
          advancedSettingsHeaders.llmModel,
          systemPrompt,
        )
        console.log(
          `📝 [${new Date().toISOString()}] Adjusted transcript: "${transcript}"`,
        )

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
          error: errorToProtobuf(error, ClientProvider.GROQ),
        })
      }
    },
    async createNote(request, context: HandlerContext) {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }
      const noteRequest = { ...request, userId }
      const newNote = await NotesRepository.create(noteRequest)
      return dbToNotePb(newNote)
    },

    async getNote(request) {
      const note = await NotesRepository.findById(request.id)
      if (!note) {
        throw new ConnectError('Note not found', Code.NotFound)
      }
      return dbToNotePb(note)
    },

    async listNotes(request, context: HandlerContext) {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }
      const since = request.sinceTimestamp
        ? new Date(request.sinceTimestamp)
        : undefined
      const notes = await NotesRepository.findByUserId(userId, since)
      return { notes: notes.map(dbToNotePb) }
    },

    async updateNote(request) {
      const updatedNote = await NotesRepository.update(request)
      if (!updatedNote) {
        throw new ConnectError('Note not found', Code.NotFound)
      }
      return dbToNotePb(updatedNote)
    },

    async deleteNote(request) {
      await NotesRepository.softDelete(request.id)
      return {}
    },

    async createInteraction(request, context: HandlerContext) {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }
      const interactionRequest = { ...request, userId }
      const newInteraction =
        await InteractionsRepository.create(interactionRequest)
      return dbToInteractionPb(newInteraction)
    },

    async getInteraction(request) {
      const interaction = await InteractionsRepository.findById(request.id)
      if (!interaction) {
        throw new ConnectError('Interaction not found', Code.NotFound)
      }
      return dbToInteractionPb(interaction)
    },

    async listInteractions(request, context: HandlerContext) {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }
      const since = request.sinceTimestamp
        ? new Date(request.sinceTimestamp)
        : undefined
      const interactions = await InteractionsRepository.findByUserId(
        userId,
        since,
      )
      return { interactions: interactions.map(dbToInteractionPb) }
    },

    async updateInteraction(request) {
      const updatedInteraction = await InteractionsRepository.update(request)
      if (!updatedInteraction) {
        throw new ConnectError(
          'Interaction not found or was deleted',
          Code.NotFound,
        )
      }
      return dbToInteractionPb(updatedInteraction)
    },

    async deleteInteraction(request) {
      await InteractionsRepository.softDelete(request.id)
      return {}
    },

    async createDictionaryItem(request, context: HandlerContext) {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }
      const dictionaryRequest = { ...request, userId }
      const newItem = await DictionaryRepository.create(dictionaryRequest)
      return dbToDictionaryItemPb(newItem)
    },

    async listDictionaryItems(request, context: HandlerContext) {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }
      const since = request.sinceTimestamp
        ? new Date(request.sinceTimestamp)
        : undefined
      const items = await DictionaryRepository.findByUserId(userId, since)
      return { items: items.map(dbToDictionaryItemPb) }
    },

    async updateDictionaryItem(request) {
      const updatedItem = await DictionaryRepository.update(request)
      if (!updatedItem) {
        throw new ConnectError(
          'Dictionary item not found or was deleted',
          Code.NotFound,
        )
      }
      return dbToDictionaryItemPb(updatedItem)
    },

    async deleteDictionaryItem(request) {
      await DictionaryRepository.softDelete(request.id)
      return {}
    },

    async deleteUserData(_request, context: HandlerContext) {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }

      console.log(`Deleting all data for authenticated user: ${userId}`)
      await Promise.all([
        NotesRepository.deleteAllUserData(userId),
        InteractionsRepository.deleteAllUserData(userId),
        DictionaryRepository.deleteAllUserData(userId),
      ])
      console.log(`Successfully deleted all data for user: ${userId}`)
      return {}
    },

    async getAdvancedSettings(_request, context: HandlerContext) {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }

      const settings = await AdvancedSettingsRepository.findByUserId(userId)
      if (!settings) {
        // Return default settings if none exist
        return create(AdvancedSettingsSchema, {
          id: '',
          userId: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          llm: create(LlmSettingsSchema, {
            asrModel: 'whisper-large-v3',
          }),
        })
      }

      return dbToAdvancedSettingsPb(settings)
    },

    async updateAdvancedSettings(request, context: HandlerContext) {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }

      const updatedSettings = await AdvancedSettingsRepository.upsert(
        userId,
        request,
      )
      return dbToAdvancedSettingsPb(updatedSettings)
    },
  })
}
