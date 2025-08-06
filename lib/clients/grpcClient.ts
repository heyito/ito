import {
  ItoService,
  AudioChunk,
  Note as NotePb,
  Interaction as InteractionPb,
  DictionaryItem as DictionaryItemPb,
  AdvancedSettings as AdvancedSettingsPb,
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
  DeleteUserDataRequestSchema,
  GetAdvancedSettingsRequestSchema,
  UpdateAdvancedSettingsRequestSchema,
} from '@/app/generated/ito_pb'
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-node'
import { ConnectError, Code } from '@connectrpc/connect'
import { BrowserWindow } from 'electron'
import { create } from '@bufbuild/protobuf'
import { setFocusedText } from '../media/text-writer'
import { Note, Interaction, DictionaryItem } from '../main/sqlite/models'
import { DictionaryTable } from '../main/sqlite/repo'
import { getAdvancedSettings, getCurrentUserId } from '../main/store'
import { ensureValidTokens } from '../auth/events'
import { Auth0Config } from '../auth/config'
import { getActiveWindow } from '../media/active-application'

class GrpcClient {
  private client: ReturnType<typeof createClient<typeof ItoService>>
  private authToken: string | null = null
  private mainWindow: BrowserWindow | null = null
  private isRefreshingTokens: boolean = false

  constructor() {
    const transport = createConnectTransport({
      baseUrl: import.meta.env.VITE_GRPC_BASE_URL,
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
      return new Headers()
    }
    return new Headers({ Authorization: `Bearer ${this.authToken}` })
  }

  private async getHeadersWithMetadata() {
    const headers = this.getHeaders()

    try {
      // Fetch vocabulary from local database
      const user_id = getCurrentUserId()
      const dictionaryItems = await DictionaryTable.findAll(user_id)

      // Convert to vocabulary format for transcription
      const vocabularyWords = dictionaryItems
        .filter(item => item.deleted_at === null)
        .map(item => item.word)

      // Add vocabulary to headers if available
      if (vocabularyWords.length > 0) {
        headers.set('vocabulary', vocabularyWords.join(','))
      }

      // Fetch window context
      const windowContext = await getActiveWindow()
      if (windowContext) {
        headers.set('window-title', windowContext.title)
        headers.set('app-name', windowContext.appName)
      }

      // Add ASR model from advanced settings
      const advancedSettings = getAdvancedSettings()
      console.log(
        '[gRPC Client] Using ASR model from advanced settings:',
        advancedSettings,
      )
      headers.set('asr-model', advancedSettings.llm.asrModel)
    } catch (error) {
      console.error(
        'Failed to fetch vocabulary/settings for transcription:',
        error,
      )
    }

    return headers
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      const shouldRetry = await this.handleAuthError(error)

      if (shouldRetry) {
        console.log('Retrying operation after token refresh')
        return await operation()
      }

      throw error
    }
  }

  private async handleAuthError(error: any): Promise<boolean> {
    // Check if this is an authentication error
    if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
      console.log(
        'Authentication error detected, attempting token refresh before logout',
      )

      // Prevent multiple simultaneous refresh attempts
      if (this.isRefreshingTokens) {
        console.log('Token refresh already in progress, skipping')
        return false
      }

      try {
        this.isRefreshingTokens = true

        // Attempt to refresh tokens
        const refreshResult = await ensureValidTokens(Auth0Config)

        if (
          refreshResult.success &&
          'tokens' in refreshResult &&
          refreshResult.tokens?.access_token
        ) {
          console.log('Token refresh successful, updating auth token')
          this.authToken = refreshResult.tokens.access_token

          // Return true to indicate the caller should retry
          return true
        } else {
          console.log('Token refresh failed, proceeding with logout')
        }
      } catch (refreshError) {
        console.error('Error during token refresh:', refreshError)
      } finally {
        this.isRefreshingTokens = false
      }

      // If we get here, token refresh failed - proceed with logout
      console.log('Signing out user due to authentication failure')

      // Notify the main window to sign out the user
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('auth-token-expired')
      }

      // Clear the auth token
      this.authToken = null
    }

    // Return false to indicate no retry should be attempted
    return false
  }

  async transcribeStream(stream: AsyncIterable<AudioChunk>) {
    return this.withRetry(async () => {
      const response = await this.client.transcribeStream(stream, {
        headers: await this.getHeadersWithMetadata(),
      })

      // Type the transcribed text into the focused application
      if (response.transcript && !response.error) {
        setFocusedText(response.transcript)
      }

      if (this.mainWindow) {
        this.mainWindow.webContents.send('transcription-result', response)
      }
      return response
    }).catch(error => {
      // Handle transcription errors separately
      if (this.mainWindow) {
        this.mainWindow.webContents.send('transcription-error', error)
      }
      throw error
    })
  }

  // =================================================================
  // Notes, Interactions, Dictionary (Unary Calls)
  // =================================================================

  async createNote(note: Note) {
    return this.withRetry(async () => {
      const request = create(CreateNoteRequestSchema, {
        id: note.id,
        interactionId: note.interaction_id ?? '',
        content: note.content,
      })
      return await this.client.createNote(request, {
        headers: this.getHeaders(),
      })
    })
  }

  async updateNote(note: Note) {
    return this.withRetry(async () => {
      const request = create(UpdateNoteRequestSchema, {
        id: note.id,
        content: note.content,
      })
      return await this.client.updateNote(request, {
        headers: this.getHeaders(),
      })
    })
  }

  async deleteNote(note: Note) {
    return this.withRetry(async () => {
      const request = create(DeleteNoteRequestSchema, {
        id: note.id,
      })
      return await this.client.deleteNote(request, {
        headers: this.getHeaders(),
      })
    })
  }

  async listNotesSince(since?: string): Promise<NotePb[]> {
    return this.withRetry(async () => {
      const request = create(ListNotesRequestSchema, {
        sinceTimestamp: since ?? '',
      })
      const response = await this.client.listNotes(request, {
        headers: this.getHeaders(),
      })
      return response.notes
    })
  }

  async createInteraction(interaction: Interaction) {
    return this.withRetry(async () => {
      // Convert Buffer to Uint8Array for protobuf
      let uint8AudioData: Uint8Array
      if (interaction.raw_audio) {
        uint8AudioData = new Uint8Array(interaction.raw_audio)
      } else {
        uint8AudioData = new Uint8Array()
      }

      const request = create(CreateInteractionRequestSchema, {
        id: interaction.id,
        title: interaction.title ?? '',
        asrOutput: JSON.stringify(interaction.asr_output),
        llmOutput: JSON.stringify(interaction.llm_output),
        rawAudio: uint8AudioData,
        durationMs: interaction.duration_ms ?? 0,
      })

      console.log(
        '[gRPC Client] Sending request with audio size:',
        request.rawAudio.length,
        'duration:',
        request.durationMs,
        'ms',
      )

      return await this.client.createInteraction(request, {
        headers: this.getHeaders(),
      })
    })
  }

  async updateInteraction(interaction: Interaction) {
    return this.withRetry(async () => {
      const request = create(UpdateInteractionRequestSchema, {
        id: interaction.id,
        title: interaction.title ?? '',
      })
      return await this.client.updateInteraction(request, {
        headers: this.getHeaders(),
      })
    })
  }

  async deleteInteraction(interaction: Interaction) {
    return this.withRetry(async () => {
      const request = create(DeleteInteractionRequestSchema, {
        id: interaction.id,
      })
      return await this.client.deleteInteraction(request, {
        headers: this.getHeaders(),
      })
    })
  }

  async listInteractionsSince(since?: string): Promise<InteractionPb[]> {
    return this.withRetry(async () => {
      const request = create(ListInteractionsRequestSchema, {
        sinceTimestamp: since ?? '',
      })
      const response = await this.client.listInteractions(request, {
        headers: this.getHeaders(),
      })
      return response.interactions
    })
  }

  async createDictionaryItem(item: DictionaryItem) {
    return this.withRetry(async () => {
      const request = create(CreateDictionaryItemRequestSchema, {
        id: item.id,
        word: item.word,
        pronunciation: item.pronunciation ?? '',
      })
      return await this.client.createDictionaryItem(request, {
        headers: this.getHeaders(),
      })
    })
  }

  async updateDictionaryItem(item: DictionaryItem) {
    return this.withRetry(async () => {
      const request = create(UpdateDictionaryItemRequestSchema, {
        id: item.id,
        word: item.word,
        pronunciation: item.pronunciation ?? '',
      })
      return await this.client.updateDictionaryItem(request, {
        headers: this.getHeaders(),
      })
    })
  }

  async deleteDictionaryItem(item: DictionaryItem) {
    return this.withRetry(async () => {
      const request = create(DeleteDictionaryItemRequestSchema, {
        id: item.id,
      })
      return await this.client.deleteDictionaryItem(request, {
        headers: this.getHeaders(),
      })
    })
  }

  async listDictionaryItemsSince(since?: string): Promise<DictionaryItemPb[]> {
    return this.withRetry(async () => {
      const request = create(ListDictionaryItemsRequestSchema, {
        sinceTimestamp: since ?? '',
      })
      const response = await this.client.listDictionaryItems(request, {
        headers: this.getHeaders(),
      })
      return response.items
    })
  }

  async deleteUserData() {
    return this.withRetry(async () => {
      const request = create(DeleteUserDataRequestSchema, {})
      return await this.client.deleteUserData(request, {
        headers: this.getHeaders(),
      })
    })
  }

  async getAdvancedSettings(): Promise<AdvancedSettingsPb> {
    return this.withRetry(async () => {
      const request = create(GetAdvancedSettingsRequestSchema, {})
      return await this.client.getAdvancedSettings(request, {
        headers: this.getHeaders(),
      })
    })
  }

  async updateAdvancedSettings(settings: {
    llm: { asrModel: string }
  }): Promise<AdvancedSettingsPb> {
    return this.withRetry(async () => {
      const request = create(UpdateAdvancedSettingsRequestSchema, {
        llm: {
          asrModel: settings.llm.asrModel,
        },
      })
      return await this.client.updateAdvancedSettings(request, {
        headers: this.getHeaders(),
      })
    })
  }
}

export const grpcClient = new GrpcClient()
