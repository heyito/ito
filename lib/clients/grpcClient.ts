import {
  ItoService,
  AudioChunk,
  AudioChunkSchema,
} from '@/app/generated/ito_pb'
import { createClient, ConnectError } from '@connectrpc/connect'
import { createGrpcTransport } from '@connectrpc/connect-node'
import { BrowserWindow } from 'electron'
import { create, Message } from '@bufbuild/protobuf'
import { setFocusedText } from '../media/text-writer'

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

  constructor() {
    const transport = createGrpcTransport({
      baseUrl: 'http://localhost:3000',
    })
    this.client = createClient(ItoService, transport)
    console.log('[gRPC Service] Client initialized in main process.')
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
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
}

// Export a singleton instance.
export const grpcClient = new GrpcClient()
