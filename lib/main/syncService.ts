import {
  DictionaryTable,
  InteractionsTable,
  KeyValueStore,
  NotesTable,
} from './sqlite/repo'
import { grpcClient } from '../clients/grpcClient'
import { Note, Interaction, DictionaryItem } from './sqlite/models'
import mainStore from './store'
import { STORE_KEYS } from '../constants/store-keys'
import type { AdvancedSettings } from './store'

const LAST_SYNCED_AT_KEY = 'lastSyncedAt'

export class SyncService {
  private isSyncing = false
  private syncInterval: NodeJS.Timeout | null = null
  private static instance: SyncService

  private constructor() {
    // Private constructor to ensure singleton pattern
  }

  public static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService()
    }
    return SyncService.instance
  }

  public async start() {
    // Clear any existing interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }

    // Initial sync on startup, then schedule periodic syncs
    await this.runSync()
    this.syncInterval = setInterval(() => this.runSync(), 1000 * 5) // Sync every 5 seconds
  }

  public stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    this.isSyncing = false
  }

  private async runSync() {
    if (this.isSyncing) {
      return
    }

    this.isSyncing = true

    try {
      const user = mainStore.get(STORE_KEYS.USER_PROFILE) as any
      if (!user?.id) {
        console.log(
          'No user logged in or user profile is missing ID. Skipping sync.',
        )
        this.isSyncing = false
        return
      }

      const lastSyncedAt = await KeyValueStore.get(LAST_SYNCED_AT_KEY)

      // =================================================================
      // PUSH LOCAL CHANGES
      // =================================================================
      if (lastSyncedAt) {
        await this.pushNotes(lastSyncedAt)
        await this.pushInteractions(lastSyncedAt)
        await this.pushDictionaryItems(lastSyncedAt)
      }

      // =================================================================
      // PULL REMOTE CHANGES
      // =================================================================
      await this.pullNotes(lastSyncedAt)
      await this.pullInteractions(lastSyncedAt)
      await this.pullDictionaryItems(lastSyncedAt)

      // =================================================================
      // SYNC ADVANCED SETTINGS
      // =================================================================
      await this.syncAdvancedSettings(lastSyncedAt)

      const newSyncTimestamp = new Date().toISOString()
      await KeyValueStore.set(LAST_SYNCED_AT_KEY, newSyncTimestamp)
    } catch (error) {
      console.error('Sync cycle failed:', error)
    } finally {
      this.isSyncing = false
    }
  }

  private async pushNotes(lastSyncedAt: string) {
    const modifiedNotes = await NotesTable.findModifiedSince(lastSyncedAt)
    if (modifiedNotes.length > 0) {
      for (const note of modifiedNotes) {
        try {
          // If created_at is after lastSyncedAt, it's a new note
          if (new Date(note.created_at) > new Date(lastSyncedAt)) {
            await grpcClient.createNote(note)
          } else if (note.deleted_at) {
            await grpcClient.deleteNote(note)
          } else {
            await grpcClient.updateNote(note)
          }
        } catch (e) {
          console.error(`Failed to push note ${note.id}:`, e)
        }
      }
    }
  }

  private async pushInteractions(lastSyncedAt: string) {
    const modifiedInteractions =
      await InteractionsTable.findModifiedSince(lastSyncedAt)
    if (modifiedInteractions.length > 0) {
      for (const interaction of modifiedInteractions) {
        try {
          if (new Date(interaction.created_at) > new Date(lastSyncedAt)) {
            await grpcClient.createInteraction(interaction)
          } else if (interaction.deleted_at) {
            await grpcClient.deleteInteraction(interaction)
          } else {
            await grpcClient.updateInteraction(interaction)
          }
        } catch (e) {
          console.error(`Failed to push interaction ${interaction.id}:`, e)
        }
      }
    }
  }

  private async pushDictionaryItems(lastSyncedAt: string) {
    const modifiedItems = await DictionaryTable.findModifiedSince(lastSyncedAt)
    if (modifiedItems.length > 0) {
      for (const item of modifiedItems) {
        try {
          if (new Date(item.created_at) > new Date(lastSyncedAt)) {
            await grpcClient.createDictionaryItem(item)
          } else if (item.deleted_at) {
            await grpcClient.deleteDictionaryItem(item)
          } else {
            await grpcClient.updateDictionaryItem(item)
          }
        } catch (e) {
          console.error(`Failed to push dictionary item ${item.id}:`, e)
        }
      }
    }
  }

  private async pullNotes(lastSyncedAt?: string) {
    const remoteNotes = await grpcClient.listNotesSince(lastSyncedAt)
    if (remoteNotes.length > 0) {
      for (const remoteNote of remoteNotes) {
        if (remoteNote.deletedAt) {
          await NotesTable.softDelete(remoteNote.id)
          continue
        }
        const localNote: Note = {
          id: remoteNote.id,
          user_id: remoteNote.userId,
          interaction_id: remoteNote.interactionId || null,
          content: remoteNote.content,
          created_at: remoteNote.createdAt,
          updated_at: remoteNote.updatedAt,
          deleted_at: remoteNote.deletedAt || null,
        }
        await NotesTable.upsert(localNote)
      }
    }
  }

  private async pullInteractions(lastSyncedAt?: string) {
    const remoteInteractions =
      await grpcClient.listInteractionsSince(lastSyncedAt)
    if (remoteInteractions.length > 0) {
      for (const remoteInteraction of remoteInteractions) {
        if (remoteInteraction.deletedAt) {
          await InteractionsTable.softDelete(remoteInteraction.id)
          continue
        }

        // Convert Uint8Array back to Buffer
        let audioBuffer: Buffer | null = null
        if (
          remoteInteraction.rawAudio &&
          remoteInteraction.rawAudio.length > 0
        ) {
          audioBuffer = Buffer.from(
            remoteInteraction.rawAudio.buffer,
            remoteInteraction.rawAudio.byteOffset,
            remoteInteraction.rawAudio.byteLength,
          )
        }

        const localInteraction: Interaction = {
          id: remoteInteraction.id,
          user_id: remoteInteraction.userId || null,
          title: remoteInteraction.title || null,
          asr_output: remoteInteraction.asrOutput
            ? JSON.parse(remoteInteraction.asrOutput)
            : null,
          llm_output: remoteInteraction.llmOutput
            ? JSON.parse(remoteInteraction.llmOutput)
            : null,
          raw_audio: audioBuffer,
          duration_ms: remoteInteraction.durationMs || 0,
          created_at: remoteInteraction.createdAt,
          updated_at: remoteInteraction.updatedAt,
          deleted_at: remoteInteraction.deletedAt || null,
        }
        await InteractionsTable.upsert(localInteraction)
      }
    }
  }

  private async pullDictionaryItems(lastSyncedAt?: string) {
    const remoteItems = await grpcClient.listDictionaryItemsSince(lastSyncedAt)
    if (remoteItems.length > 0) {
      for (const remoteItem of remoteItems) {
        if (remoteItem.deletedAt) {
          await DictionaryTable.softDelete(remoteItem.id)
          continue
        }
        const localItem: DictionaryItem = {
          id: remoteItem.id,
          user_id: remoteItem.userId,
          word: remoteItem.word,
          pronunciation: remoteItem.pronunciation || null,
          created_at: remoteItem.createdAt,
          updated_at: remoteItem.updatedAt,
          deleted_at: remoteItem.deletedAt || null,
        }
        await DictionaryTable.upsert(localItem)
      }
    }
  }

  private async syncAdvancedSettings(lastSyncedAt?: string) {
    try {
      // Get remote advanced settings
      const remoteSettings = await grpcClient.getAdvancedSettings()

      // Compare timestamps to determine sync direction
      const remoteUpdatedAt = new Date(remoteSettings.updatedAt)
      const lastSyncTime = lastSyncedAt ? new Date(lastSyncedAt) : new Date(0)

      // If remote settings were updated after last sync, pull them to local
      if (remoteUpdatedAt > lastSyncTime) {
        const updatedLocalSettings: AdvancedSettings = {
          llm: {
            asrModel: remoteSettings.llm?.asrModel || 'whisper-large-v3',
            llmModel: remoteSettings.llm?.llmModel || 'lama-3.3-70b-versatile',
            llmTemperature: remoteSettings.llm?.llmTemperature || '0.1',
            transcriptionPrompt: remoteSettings.llm?.transcriptionPrompt || '',
            editingPrompt: remoteSettings.llm?.editingPrompt || '',
          },
        }

        // Update local store
        mainStore.set(STORE_KEYS.ADVANCED_SETTINGS, updatedLocalSettings)
      }
      // Note: We don't push local changes to server in this implementation
      // since advanced settings are typically managed through the UI which
      // directly calls the server API. This sync is primarily for pulling
      // changes made on other devices or through other clients.
    } catch (error) {
      console.error('Failed to sync advanced settings:', error)
    }
  }
}

export const syncService = SyncService.getInstance()
