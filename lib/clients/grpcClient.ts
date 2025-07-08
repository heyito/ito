import {
  ItoService,
  AudioChunk,
  Note as NotePb,
  Interaction as InteractionPb,
  DictionaryItem as DictionaryItemPb,
  CreateNoteRequestSchema,
  UpdateNoteRequestSchema,
  DeleteNoteRequestSchema,
  ListNotesRequestSchema,
  CreateInteractionRequestSchema,
  UpdateInteractionRequestSchema,
  DeleteInteractionRequestSchema,
  ListInteractionsRequestSchema,
  CreateDictionaryItemRequestSchema,
  DeleteDictionaryItemRequestSchema,
  UpdateDictionaryItemRequestSchema,
  ListDictionaryItemsRequestSchema,
} from '@/app/generated/ito_pb'
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-node'
import { BrowserWindow } from 'electron'
import { create } from '@bufbuild/protobuf'
import { setFocusedText } from '../media/text-writer'
import { Note, Interaction, DictionaryItem } from '../main/sqlite/models'

class GrpcClient {
  private client: ReturnType<typeof createClient<typeof ItoService>>
  private authToken: string | null = null
  private mainWindow: BrowserWindow | null = null

  constructor() {
    const transport = createConnectTransport({
      baseUrl: import.meta.env.VITE_GRPC_BASE_URL || 'http://localhost:3000',
      httpVersion: '1.1',
    })
    this.client = createClient(ItoService, transport)
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  setAuthToken(token: string | null) {
    this.authToken = token
  }

  private getHeaders() {
    if (!this.authToken) {
      // Though we have guards elsewhere, this is a final check.
      // Throwing here helps us pinpoint auth issues during development.
      throw new Error('gRPC call made without an auth token.')
    }
    return new Headers({ Authorization: `Bearer ${this.authToken}` })
  }

  async transcribeStream(stream: AsyncIterable<AudioChunk>) {
    try {
      const response = await this.client.transcribeStream(stream, {
        headers: this.getHeaders(),
      })

      // Type the transcribed text into the focused application
      if (response.transcript) {
        setFocusedText(response.transcript)
      }

      if (this.mainWindow) {
        this.mainWindow.webContents.send('transcription-result', response)
      }
      return response
    } catch (error) {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('transcription-error', error)
      }
      throw error
    }
  }

  // =================================================================
  // Notes, Interactions, Dictionary (Unary Calls)
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

  async deleteNote(note: Note) {
    const request = create(DeleteNoteRequestSchema, {
      id: note.id,
    })
    return this.client.deleteNote(request, { headers: this.getHeaders() })
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

  async createInteraction(interaction: Interaction) {
    const request = create(CreateInteractionRequestSchema, {
      id: interaction.id,
      userId: interaction.user_id ?? '',
      title: interaction.title ?? '',
      asrOutput: JSON.stringify(interaction.asr_output),
      llmOutput: JSON.stringify(interaction.llm_output),
    })
    return this.client.createInteraction(request, {
      headers: this.getHeaders(),
    })
  }

  async updateInteraction(interaction: Interaction) {
    const request = create(UpdateInteractionRequestSchema, {
      id: interaction.id,
      title: interaction.title ?? '',
    })
    return this.client.updateInteraction(request, {
      headers: this.getHeaders(),
    })
  }

  async deleteInteraction(interaction: Interaction) {
    const request = create(DeleteInteractionRequestSchema, {
      id: interaction.id,
    })
    return this.client.deleteInteraction(request, {
      headers: this.getHeaders(),
    })
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

  async deleteDictionaryItem(item: DictionaryItem) {
    const request = create(DeleteDictionaryItemRequestSchema, {
      id: item.id,
    })
    return this.client.deleteDictionaryItem(request, {
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
