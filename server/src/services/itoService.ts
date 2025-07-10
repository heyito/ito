import type { ConnectRouter } from '@connectrpc/connect'
import {
  TranscribeFileRequest,
  AudioChunk,
  TranscriptionResponseSchema,
  ItoService as ItoServiceDesc,
  Note,
  NoteSchema,
  Interaction,
  InteractionSchema,
  DictionaryItem,
  DictionaryItemSchema,
} from '../generated/ito_pb.js'
import { create } from '@bufbuild/protobuf'
import type { HandlerContext } from '@connectrpc/connect'
import { groqClient } from '../clients/groqClient.js'
import {
  DictionaryRepository,
  InteractionsRepository,
  NotesRepository,
} from '../db/repo.js'
import {
  Note as DbNote,
  Interaction as DbInteraction,
  DictionaryItem as DbDictionaryItem,
} from '../db/models.js'
import { ConnectError, Code } from '@connectrpc/connect'
import { kUser } from '../auth/userContext.js'

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

function wrapHandler<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args)
    } catch (err) {
      console.error('Unhandled error in RPC handler:', err)
      throw new ConnectError(
        'Internal server error',
        Code.Internal,
        undefined,
        undefined,
        err,
      )
    }
  }) as T
}

// Export the service implementation as a function that takes a ConnectRouter
export default (router: ConnectRouter) => {
  router.service(ItoServiceDesc, {
    transcribeFile: wrapHandler(async (request: TranscribeFileRequest) => {
      if (!request.audioData || request.audioData.length === 0) {
        throw new Error('No audio data received')
      }
      const dummyTranscript = 'This is a transcript from the whole file.'
      return create(TranscriptionResponseSchema, {
        transcript: dummyTranscript,
      })
    }),

    transcribeStream: wrapHandler(
      async (requests: AsyncIterable<AudioChunk>, context: HandlerContext) => {
        const audioChunks: Uint8Array[] = []
        for await (const chunk of requests) {
          audioChunks.push(chunk.audioData)
        }

        // Process each audio chunk from the stream
        for await (const chunk of requests) {
          audioChunks.push(chunk.audioData)
        }

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

          // 3. Extract vocabulary from gRPC metadata
          const vocabularyHeader = context.requestHeader.get('vocabulary')
          const vocabulary = vocabularyHeader
            ? vocabularyHeader.split(',')
            : undefined

          // 4. Send the corrected WAV file.
          const transcript = await groqClient.transcribeAudio(
            fullAudioWAV,
            'wav',
            vocabulary,
          )

          return create(TranscriptionResponseSchema, {
            transcript,
          })
        } catch (error: any) {
          console.error(
            'Failed to process transcription via GroqClient:',
            error,
          )
          // return error response
          return create(TranscriptionResponseSchema, {
            transcript: `Error processing transcription: ${error?.message}`,
          })
        }
      },
    ),

    createNote: wrapHandler(async (request, context) => {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }
      const noteRequest = { ...request, userId }
      const newNote = await NotesRepository.create(noteRequest)
      return dbToNotePb(newNote)
    }),

    getNote: wrapHandler(async request => {
      const note = await NotesRepository.findById(request.id)
      if (!note) {
        throw new ConnectError('Note not found', Code.NotFound)
      }
      return dbToNotePb(note)
    }),

    listNotes: wrapHandler(async (request, context) => {
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
    }),

    updateNote: wrapHandler(async request => {
      const updatedNote = await NotesRepository.update(request)
      if (!updatedNote) {
        throw new ConnectError('Note not found', Code.NotFound)
      }
      return dbToNotePb(updatedNote)
    }),

    deleteNote: wrapHandler(async request => {
      await NotesRepository.softDelete(request.id)
      return {}
    }),

    createInteraction: wrapHandler(async (request, context) => {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }
      const interactionRequest = { ...request, userId }
      const newInteraction =
        await InteractionsRepository.create(interactionRequest)
      return dbToInteractionPb(newInteraction)
    }),

    getInteraction: wrapHandler(async request => {
      const interaction = await InteractionsRepository.findById(request.id)
      if (!interaction) {
        throw new ConnectError('Interaction not found', Code.NotFound)
      }
      return dbToInteractionPb(interaction)
    }),

    listInteractions: wrapHandler(async (request, context) => {
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
    }),

    updateInteraction: wrapHandler(async request => {
      const updatedInteraction = await InteractionsRepository.update(request)
      if (!updatedInteraction) {
        throw new ConnectError(
          'Interaction not found or was deleted',
          Code.NotFound,
        )
      }
      return dbToInteractionPb(updatedInteraction)
    }),

    deleteInteraction: wrapHandler(async request => {
      await InteractionsRepository.softDelete(request.id)
      return {}
    }),

    createDictionaryItem: wrapHandler(async (request, context) => {
      const user = context.values.get(kUser)
      const userId = user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }
      const dictionaryRequest = { ...request, userId }
      const newItem = await DictionaryRepository.create(dictionaryRequest)
      return dbToDictionaryItemPb(newItem)
    }),

    listDictionaryItems: wrapHandler(async (request, context) => {
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
    }),

    updateDictionaryItem: wrapHandler(async request => {
      const updatedItem = await DictionaryRepository.update(request)
      if (!updatedItem) {
        throw new ConnectError(
          'Dictionary item not found or was deleted',
          Code.NotFound,
        )
      }
      return dbToDictionaryItemPb(updatedItem)
    }),

    deleteDictionaryItem: wrapHandler(async request => {
      await DictionaryRepository.softDelete(request.id)
      return {}
    }),

    deleteUserData: wrapHandler(async (_request, context) => {
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
    }),
  })
}
