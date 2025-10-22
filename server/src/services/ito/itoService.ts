import type { ConnectRouter } from '@connectrpc/connect'
import {
  AudioChunk,
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
  TranscribeStreamRequest,
} from '../../generated/ito_pb.js'
import { create } from '@bufbuild/protobuf'
import type { HandlerContext } from '@connectrpc/connect'
import { getStorageClient } from '../../clients/s3storageClient.js'
import { v4 as uuidv4 } from 'uuid'
import { createAudioKey } from '../../constants/storage.js'
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
import { transcribeStreamV2Handler } from './transcribeStreamV2Handler.js'
import { transcribeStreamHandler } from './transcribeStreamHandler.js'

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

function dbToInteractionPb(
  dbInteraction: DbInteraction,
  rawAudio?: Buffer,
): Interaction {
  let rawAudioDb: Uint8Array | undefined
  if (rawAudio) {
    rawAudioDb = new Uint8Array(rawAudio)
  } else if (dbInteraction.raw_audio) {
    rawAudioDb = new Uint8Array(dbInteraction.raw_audio)
  } else {
    rawAudioDb = undefined
  }

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
    rawAudio: rawAudioDb,
    rawAudioId: dbInteraction.raw_audio_id ?? '',
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
    async transcribeStreamV2(
      requests: AsyncIterable<TranscribeStreamRequest>,
      context: HandlerContext,
    ) {
      return transcribeStreamV2Handler.process(requests, context)
    },

    /**
     * @deprecated Legacy endpoint maintained for backwards compatibility.
     * New clients should use transcribeStreamV2.
     */
    async transcribeStream(
      requests: AsyncIterable<AudioChunk>,
      context: HandlerContext,
    ) {
      return transcribeStreamHandler.process(requests, context)
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

      let rawAudioId: string | undefined

      // If raw audio is provided, upload to S3
      if (request.rawAudio && request.rawAudio.length > 0) {
        try {
          const storageClient = getStorageClient()
          rawAudioId = uuidv4()
          const audioKey = createAudioKey(userId, rawAudioId)

          // Upload audio to S3
          await storageClient.uploadObject(
            audioKey,
            Buffer.from(request.rawAudio),
            undefined, // ContentType
            {
              userId,
              interactionId: request.id,
              timestamp: new Date().toISOString(),
            },
          )

          // Create interaction with UUID reference instead of blob
          const interactionRequest = {
            ...request,
            userId,
            rawAudioId,
            rawAudio: undefined, // Don't store the blob in DB
          }
          const newInteraction =
            await InteractionsRepository.create(interactionRequest)
          return dbToInteractionPb(newInteraction)
        } catch (error) {
          console.error('Failed to upload audio to S3:', error)

          throw new ConnectError(
            'Failed to store interaction audio',
            Code.Internal,
          )
        }
      } else {
        // No audio provided
        const interactionRequest = { ...request, userId }
        const newInteraction =
          await InteractionsRepository.create(interactionRequest)
        return dbToInteractionPb(newInteraction)
      }
    },

    async getInteraction(request) {
      const interaction = await InteractionsRepository.findById(request.id)
      if (!interaction) {
        throw new ConnectError('Interaction not found', Code.NotFound)
      }

      // If audio is stored in S3, fetch it
      if (interaction.raw_audio_id && !interaction.raw_audio) {
        try {
          const storageClient = getStorageClient()
          const userId = interaction.user_id || 'unknown'
          const audioKey = createAudioKey(userId, interaction.raw_audio_id)

          const { body } = await storageClient.getObject(audioKey)
          if (body) {
            // Convert stream to buffer
            const chunks: Uint8Array[] = []
            for await (const chunk of body) {
              chunks.push(chunk as Uint8Array)
            }
            interaction.raw_audio = Buffer.concat(chunks)
          }
        } catch (error) {
          console.error('Failed to fetch audio from S3:', error)
          // Continue without audio if S3 fetch fails
        }
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

      // Create a map to store audio buffers by interaction ID
      const rawAudioMap = new Map<string, Buffer>()

      // Fetch all audio files from S3 in parallel
      const storageClient = getStorageClient()
      const audioFetchPromises = interactions
        .filter(
          interaction => interaction.raw_audio_id && !interaction.raw_audio,
        )
        .map(async interaction => {
          try {
            const audioKey = createAudioKey(
              interaction.user_id || userId,
              interaction.raw_audio_id!,
            )
            const { body } = await storageClient.getObject(audioKey)
            if (body) {
              // Convert stream to buffer
              const chunks: Uint8Array[] = []
              for await (const chunk of body) {
                chunks.push(chunk as Uint8Array)
              }
              const buffer = Buffer.concat(chunks)
              rawAudioMap.set(interaction.id, buffer)
            }
          } catch (error) {
            console.error(
              `Failed to fetch audio for interaction ${interaction.id}:`,
              error,
            )
          }
        })

      // Wait for all audio fetches to complete
      await Promise.all(audioFetchPromises)

      return {
        interactions: interactions.map(dbInteraction => {
          // Use S3 audio if available
          const audioBuffer = rawAudioMap.get(dbInteraction.id) || undefined
          return dbToInteractionPb(dbInteraction, audioBuffer)
        }),
      }
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
