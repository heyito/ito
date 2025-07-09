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

// Export the service implementation as a function that takes a ConnectRouter
export default (router: ConnectRouter) => {
  router.service(ItoServiceDesc, {
    // Transcribe file implementation
    async transcribeFile(request: TranscribeFileRequest) {
      // Validate audio data exists
      if (!request.audioData || request.audioData.length === 0) {
        throw new Error('No audio data received')
      }

      const dummyTranscript = 'This is a transcript from the whole file.'

      return create(TranscriptionResponseSchema, {
        transcript: dummyTranscript,
      })
    },

    // Transcribe stream implementation
    async transcribeStream(
      requests: AsyncIterable<AudioChunk>,
      _context: HandlerContext,
    ) {
      const audioChunks: Uint8Array[] = []

      // Process each audio chunk from the stream
      for await (const chunk of requests) {
        console.log(`Received audio chunk of size: ${chunk.audioData.length}`)
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
        // --- THIS IS THE FIX ---
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

        // 3. Send the corrected WAV file.
        const transcript = await groqClient.transcribeAudio(fullAudioWAV, 'wav')

        return create(TranscriptionResponseSchema, {
          transcript,
        })
      } catch (error: any) {
        console.error('Failed to process transcription via GroqClient:', error)
        // return error response
        return create(TranscriptionResponseSchema, {
          transcript: `Error processing transcription: ${error?.message}`,
        })
      }
    },

    // Note Service
    async createNote(request) {
      const newNote = await NotesRepository.create(request)
      return dbToNotePb(newNote)
    },

    async getNote(request) {
      const note = await NotesRepository.findById(request.id)
      if (!note) {
        throw new ConnectError('Note not found', Code.NotFound)
      }
      return dbToNotePb(note)
    },

    async listNotes(request) {
      const since = request.sinceTimestamp
        ? new Date(request.sinceTimestamp)
        : undefined
      const notes = await NotesRepository.findByUserId(request.userId, since)
      return {
        notes: notes.map(dbToNotePb),
      }
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

    // Interaction Service
    async createInteraction(request) {
      const newInteraction = await InteractionsRepository.create(request)
      return dbToInteractionPb(newInteraction)
    },

    async getInteraction(request) {
      const interaction = await InteractionsRepository.findById(request.id)
      if (!interaction) {
        throw new ConnectError('Interaction not found', Code.NotFound)
      }
      return dbToInteractionPb(interaction)
    },

    async listInteractions(request) {
      const since = request.sinceTimestamp
        ? new Date(request.sinceTimestamp)
        : undefined
      const interactions = await InteractionsRepository.findByUserId(
        request.userId,
        since,
      )
      return {
        interactions: interactions.map(dbToInteractionPb),
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

    // Dictionary Service
    async createDictionaryItem(request) {
      const newItem = await DictionaryRepository.create(request)
      return dbToDictionaryItemPb(newItem)
    },

    async listDictionaryItems(request) {
      const since = request.sinceTimestamp
        ? new Date(request.sinceTimestamp)
        : undefined
      const items = await DictionaryRepository.findByUserId(
        request.userId,
        since,
      )
      return {
        items: items.map(dbToDictionaryItemPb),
      }
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

    async deleteUserData(request, context: HandlerContext) {
      // Extract user ID from authenticated user's token
      const userId = (context as any).request?.user?.sub
      if (!userId) {
        throw new ConnectError('User not authenticated', Code.Unauthenticated)
      }

      console.log(`Deleting all data for authenticated user: ${userId}`)

      // Delete all user data from all tables
      await Promise.all([
        NotesRepository.deleteAllUserData(userId),
        InteractionsRepository.deleteAllUserData(userId),
        DictionaryRepository.deleteAllUserData(userId),
      ])

      console.log(`Successfully deleted all data for user: ${userId}`)
      return {}
    },
  })
}
