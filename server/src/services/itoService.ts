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

export enum ItoMode {
  TRANSCRIBE,
  EDIT,
}

export const MODE_PROMPT: { [key in ItoMode]: string } = {
  [ItoMode.TRANSCRIBE]: `
  You are a real-time Transcript Polisher assistant. Your job is to take a raw speech transcript—complete with hesitations (“uh,” “um”), false starts, repetitions, and filler—and produce a concise, polished version suitable for pasting directly into the user's active document (email, report, chat, etc.).

— Keep the user's meaning and tone intact: don't introduce ideas or change intent.
— Remove disfluencies: delete “uh,” “um,” “you know,” repeated words, and false starts.
— Resolve corrections smoothly: when the speaker self-corrects (“let's do next week… no, next month”), choose the final phrasing.
— Preserve natural phrasing: maintain contractions and informal tone if present, unless clarity demands adjustment.
— Maintain accuracy: do not invent or omit key details like dates, names, or numbers.
— Produce clean prose: use complete sentences, correct punctuation, and paragraph breaks only where needed for readability.
— Operate within a single reply: output only the cleaned text—no commentary, meta-notes, or apologies.

Example
Raw transcript:
“Uhhh, so, I was thinking… maybe we could—uh—shoot for Thursday morning? No, actually, let's aim for the first week of May.”

Cleaned output:
“Let's schedule the meeting for the first week of May.”

When you receive a transcript, immediately return the polished version following these rules.`,

  [ItoMode.EDIT]: `
  You are a Command-Interpreter assistant. Your job is to take a raw speech transcript—complete with hesitations, false starts, “umm”s and self-corrections—and treat it as the user issuing a high-level instruction. Instead of merely polishing their words, you must:
	1.	Extract the intent: identify the action the user is asking for (e.g. “write me a GitHub issue,” “draft a sorry-I-missed-our-meeting email,” “produce a summary of X,” etc.).
	2.	Ignore disfluencies: strip out “uh,” “um,” false starts and filler so you see only the core command.
	3.	Map to a template: choose an appropriate standard format (GitHub issue markdown template, professional email, bullet-point agenda, etc.) that matches the intent.
	4.	Generate the deliverable: produce a fully-formed document in that format, filling in placeholders sensibly from any details in the transcript.
	5.	Do not add new intent: if the transcript doesn't specify something (e.g. title, recipients, date), use reasonable defaults (e.g. “Untitled Issue,” “To: [Recipient]”) or prompt the user for the missing piece.
	6.	Produce only the final document: no commentary, apologies, or side-notes—just the completed issue/email/summary/etc.
`,
}

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

// Export the service implementation as a function that takes a ConnectRouter
export default (router: ConnectRouter) => {
  router.service(ItoServiceDesc, {
    async transcribeFile(request: TranscribeFileRequest) {
      if (!request.audioData || request.audioData.length === 0) {
        throw new Error('No audio data received')
      }
      const dummyTranscript = 'This is a transcript from the whole file.'
      return create(TranscriptionResponseSchema, {
        transcript: dummyTranscript,
      })
    },

    async transcribeStream(
      requests: AsyncIterable<AudioChunk>,
      context: HandlerContext,
    ) {
      const audioChunks: Uint8Array[] = []

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
        let transcript = await groqClient.transcribeAudio(
          fullAudioWAV,
          'wav',
          vocabulary,
        )

        // 5. Check if transcript contains "Hey Ito" in the first 5 words
        const words = transcript.trim().split(/\s+/)
        const firstFiveWords = words.slice(0, 5).join(' ').toLowerCase()

        let mode = ItoMode.TRANSCRIBE
        if (firstFiveWords.includes('hey ito')) {
          mode = ItoMode.EDIT
        }

        transcript = await groqClient.adjustTranscript(transcript, mode)

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
  })
}
