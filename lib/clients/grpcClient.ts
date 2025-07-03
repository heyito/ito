import {
  ItoService,
  AudioChunk,
  AudioChunkSchema,
  Note as NotePb,
  Interaction as InteractionPb,
  DictionaryItem as DictionaryItemPb,
  CreateNoteRequestSchema,
  UpdateNoteRequestSchema,
  ListNotesRequestSchema,
  CreateInteractionRequestSchema,
  UpdateInteractionRequestSchema,
  ListInteractionsRequestSchema,
  CreateDictionaryItemRequestSchema,
  UpdateDictionaryItemRequestSchema,
  ListDictionaryItemsRequestSchema,
} from '@/app/generated/ito_pb'
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-node'
import { BrowserWindow } from 'electron'
import { create } from '@bufbuild/protobuf'
import { setFocusedText } from '../media/text-writer'
import { Note, Interaction, DictionaryItem } from '../main/sqlite/models'

// A helper type for our promise-based queue
type ChunkQueueItem = {
  resolve: (value?: any) => void
  promise: Promise<any>
}

/**
 * Service to manage the gRPC client and transcription stream from the main process.
 */
class GrpcClient {
  private client: ReturnType<typeof createClient<typeof ItoService>>
  private mainWindow: BrowserWindow | null = null

  // --- NEW: State for managing the async generator ---
  private chunkQueue: Buffer[] = []
  private streamClosed = false
  private newChunkNotifier: ChunkQueueItem | null = null
  private authToken: string | null = null

  constructor() {
    const transport = createConnectTransport({
      baseUrl: process.env.GRPC_BASE_URL || 'http://localhost:3000',
      httpVersion: '1.1',
    })
    this.client = createClient(ItoService, transport)
    console.log('[gRPC Service] Client initialized in main process.')
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  public setAuthToken(token: string | null) {
    this.authToken = token
  }

  private getHeaders() {
    if (!this.authToken) {
      console.warn('gRPC call made without auth token.')
      return new Headers()
    }
    return new Headers({ Authorization: `Bearer ${this.authToken}` })
  }

  /**
   * Creates an async generator that yields audio chunks from our queue.
   * This generator is passed to the ConnectRPC client method.
   */
  private async *createAudioStream(): AsyncIterable<AudioChunk> {
    while (!this.streamClosed) {
      // If the queue is empty, wait for a signal that a new chunk has arrived.
      if (this.chunkQueue.length === 0) {
        this.newChunkNotifier = this.createNotifier()
        await this.newChunkNotifier.promise
      }

      // Yield all chunks currently in the queue.
      while (this.chunkQueue.length > 0) {
        const chunk = this.chunkQueue.shift()
        if (chunk) {
          yield create(AudioChunkSchema, { audioData: chunk })
        }
      }
    }
  }

  startStream() {
    console.info('[gRPC Service] Starting new transcription stream.')

    this.chunkQueue = []
    this.streamClosed = false
    this.newChunkNotifier = null

    // Call the RPC method with our async generator.
    this.client
      .transcribeStream(this.createAudioStream())
      .then(response => {
        console.info(
          '[gRPC Service] Transcription received:',
          response.transcript,
        )
        setFocusedText(response.transcript)
      })
      .catch(error => {
        console.error('[gRPC Service] An unexpected error occurred:', error)
      })
      .finally(() => {
        console.log('[gRPC Service] Stream has fully terminated.')
        this.streamClosed = true
      })
  }

  sendAudioChunk(chunk: Buffer) {
    if (this.streamClosed) {
      console.warn('[gRPC Service] Cannot send audio chunk, stream is closed.')
      return
    }
    // Add the chunk to the queue
    this.chunkQueue.push(chunk)

    // Signal the waiting generator that a new chunk is available.
    if (this.newChunkNotifier) {
      this.newChunkNotifier.resolve()
      this.newChunkNotifier = null
    }
  }

  stopStream() {
    if (!this.streamClosed) {
      console.log('[gRPC Service] Finalizing transcription stream.')
      this.streamClosed = true

      // If the generator is waiting for a chunk, resolve its promise to unblock it
      // and allow it to see that `streamClosed` is true.
      if (this.newChunkNotifier) {
        this.newChunkNotifier.resolve()
        this.newChunkNotifier = null
      }
    }
  }

  private resetStreamState() {
    // If a stream is active, signal it to stop
    if (!this.streamClosed) {
      this.stopStream()
    }
    this.chunkQueue = []
    this.streamClosed = false
    this.newChunkNotifier = null
  }

  private createNotifier(): ChunkQueueItem {
    let resolve: (value?: any) => void = () => {}
    const promise = new Promise(r => {
      resolve = r
    })
    return { resolve, promise }
  }

  // =================================================================
  // Notes
  // =================================================================
  async createNote(note: Note) {
    const request = create(CreateNoteRequestSchema, {
      id: note.id,
      userId: note.user_id,
      interactionId: note.interaction_id ?? '',
      content: note.content,
    })
    return this.client.createNote(request, { headers: this.getHeaders() })
  }

  async updateNote(note: Note) {
    const request = create(UpdateNoteRequestSchema, {
      id: note.id,
      content: note.content,
    })
    return this.client.updateNote(request, { headers: this.getHeaders() })
  }

  async listNotesSince(userId: string, since?: string): Promise<NotePb[]> {
    const request = create(ListNotesRequestSchema, {
      userId,
      sinceTimestamp: since,
    })
    const response = await this.client.listNotes(request, {
      headers: this.getHeaders(),
    })
    return response.notes
  }

  // =================================================================
  // Interactions
  // =================================================================
  async createInteraction(interaction: Interaction) {
    const request = create(CreateInteractionRequestSchema, {
      id: interaction.id,
      userId: interaction.user_id ?? '',
      title: interaction.title ?? '',
      asrOutput: JSON.stringify(interaction.asr_output),
      llmOutput: JSON.stringify(interaction.llm_output),
    })
    return this.client.createInteraction(request, { headers: this.getHeaders() })
  }

  async updateInteraction(interaction: Interaction) {
    const request = create(UpdateInteractionRequestSchema, {
      id: interaction.id,
      title: interaction.title ?? '',
    })
    return this.client.updateInteraction(request, { headers: this.getHeaders() })
  }

  async listInteractionsSince(
    userId: string,
    since?: string,
  ): Promise<InteractionPb[]> {
    const request = create(ListInteractionsRequestSchema, {
      userId,
      sinceTimestamp: since,
    })
    const response = await this.client.listInteractions(request, {
      headers: this.getHeaders(),
    })
    return response.interactions
  }

  // =================================================================
  // Dictionary
  // =================================================================
  async createDictionaryItem(item: DictionaryItem) {
    const request = create(CreateDictionaryItemRequestSchema, {
      id: item.id,
      userId: item.user_id,
      word: item.word,
      pronunciation: item.pronunciation ?? '',
    })
    return this.client.createDictionaryItem(request, {
      headers: this.getHeaders(),
    })
  }

  async updateDictionaryItem(item: DictionaryItem) {
    const request = create(UpdateDictionaryItemRequestSchema, {
      id: item.id,
      word: item.word,
      pronunciation: item.pronunciation ?? '',
    })
    return this.client.updateDictionaryItem(request, {
      headers: this.getHeaders(),
    })
  }

  async listDictionaryItemsSince(
    userId: string,
    since?: string,
  ): Promise<DictionaryItemPb[]> {
    const request = create(ListDictionaryItemsRequestSchema, {
      userId,
      sinceTimestamp: since,
    })
    const response = await this.client.listDictionaryItems(request, {
      headers: this.getHeaders(),
    })
    return response.items
  }
}

export const grpcClient = new GrpcClient()