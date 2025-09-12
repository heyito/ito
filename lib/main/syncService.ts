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
import { DEFAULT_ADVANCED_SETTINGS } from '../constants/generated-defaults.js'

const LAST_SYNCED_AT_KEY = 'lastSyncedAt'

function getEnvNamespace(): string {
  const baseUrl = (import.meta.env?.VITE_GRPC_BASE_URL as string) || ''
  try {
    const url = new URL(baseUrl)
    return url.host || baseUrl || 'unknown'
  } catch {
    return baseUrl || 'unknown'
  }
}

function getLastSyncedAtKey(userId: string): string {
  const envNs = getEnvNamespace()
  return `${LAST_SYNCED_AT_KEY}:${envNs}:${userId}`
}

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

      const lastSyncedAtKey = getLastSyncedAtKey(user.id)
      const lastSyncedAt = await KeyValueStore.get(lastSyncedAtKey)

      // =================================================================
      // PUSH LOCAL CHANGES
      // =================================================================
      let processedChanges = 0
      if (lastSyncedAt) {
        processedChanges += await this.pushNotes(lastSyncedAt)
        processedChanges += await this.pushInteractions(lastSyncedAt)
        processedChanges += await this.pushDictionaryItems(lastSyncedAt)
      }

      // =================================================================
      // PULL REMOTE CHANGES
      // =================================================================
      processedChanges += await this.pullNotes(lastSyncedAt)
      processedChanges += await this.pullInteractions(lastSyncedAt)
      processedChanges += await this.pullDictionaryItems(lastSyncedAt)

      // =================================================================
      // SYNC ADVANCED SETTINGS
      // =================================================================
      await this.syncAdvancedSettings(lastSyncedAt)

      if (processedChanges > 0) {
        const newSyncTimestamp = new Date().toISOString()
        await KeyValueStore.set(lastSyncedAtKey, newSyncTimestamp)
      }
    } catch (error) {
      console.error('Sync cycle failed:', error)
    } finally {
      this.isSyncing = false
    }
  }

  private async pushNotes(lastSyncedAt: string): Promise<number> {
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
    return modifiedNotes.length
  }

  private async pushInteractions(lastSyncedAt: string): Promise<number> {
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
    return modifiedInteractions.length
  }

  private async pushDictionaryItems(lastSyncedAt: string): Promise<number> {
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
    return modifiedItems.length
  }

  private async pullNotes(lastSyncedAt?: string): Promise<number> {
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
    return remoteNotes.length
  }

  private async pullInteractions(lastSyncedAt?: string): Promise<number> {
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
          raw_audio_id: remoteInteraction.rawAudioId,
          sample_rate: null,
        }
        await InteractionsTable.upsert(localInteraction)
      }
    }
    return remoteInteractions.length
  }

  private async pullDictionaryItems(lastSyncedAt?: string): Promise<number> {
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
    return remoteItems.length
  }

  private async syncAdvancedSettings(lastSyncedAt?: string) {
    try {
      // Get remote advanced settings
      const remoteSettings = await grpcClient.getAdvancedSettings()
      if (!remoteSettings) {
        console.warn('No remote advanced settings found, skipping sync.')
        return
      }

      // Compare timestamps to determine sync direction
      const remoteUpdatedAt = new Date(remoteSettings.updatedAt)
      const lastSyncTime = lastSyncedAt ? new Date(lastSyncedAt) : new Date(0)

      // If remote settings were updated after last sync, pull them to local
      if (remoteUpdatedAt > lastSyncTime) {
        const updatedLocalSettings: AdvancedSettings = {
          llm: {
            asrProvider:
              remoteSettings.llm?.asrProvider ||
              DEFAULT_ADVANCED_SETTINGS.asrProvider,
            asrModel:
              remoteSettings.llm?.asrModel ||
              DEFAULT_ADVANCED_SETTINGS.asrModel,
            asrPrompt:
              remoteSettings.llm?.asrPrompt ||
              DEFAULT_ADVANCED_SETTINGS.asrPrompt,
            llmProvider:
              remoteSettings.llm?.llmProvider ||
              DEFAULT_ADVANCED_SETTINGS.llmProvider,
            llmModel:
              remoteSettings.llm?.llmModel ||
              DEFAULT_ADVANCED_SETTINGS.llmModel,
            llmTemperature:
              remoteSettings.llm?.llmTemperature ||
              DEFAULT_ADVANCED_SETTINGS.llmTemperature,
            transcriptionPrompt:
              remoteSettings.llm?.transcriptionPrompt ||
              DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
            editingPrompt:
              remoteSettings.llm?.editingPrompt ||
              DEFAULT_ADVANCED_SETTINGS.editingPrompt,
            noSpeechThreshold:
              remoteSettings.llm?.noSpeechThreshold ||
              DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold,
            lowQualityThreshold:
              remoteSettings.llm?.lowQualityThreshold ||
              DEFAULT_ADVANCED_SETTINGS.lowQualityThreshold,
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
