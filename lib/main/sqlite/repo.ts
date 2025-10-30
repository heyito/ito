import { run, get, all } from './utils'
import type { Interaction, Note, DictionaryItem, UserMetadata } from './models'
import { PaidStatus } from './models'
import { v4 as uuidv4 } from 'uuid'

// SQLite error codes (from better-sqlite3 and node-sqlite3)
const SQLITE_CONSTRAINT_UNIQUE = 'SQLITE_CONSTRAINT_UNIQUE'

// Helper function to check if error is a unique constraint violation
function isUniqueConstraintError(error: any): boolean {
  return (
    error.code === SQLITE_CONSTRAINT_UNIQUE ||
    error.message?.includes('UNIQUE constraint failed') ||
    error.errno === 19 // SQLITE_CONSTRAINT
  )
}

// Result type for database operations
export type DbResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorType?: string }

// Helper function to handle unique constraint errors for dictionary items
function handleDictionaryConstraintError(
  error: any,
  word: string,
): DbResult<never> {
  if (isUniqueConstraintError(error)) {
    return {
      success: false,
      error: `"${word}" already exists in your dictionary`,
      errorType: 'DUPLICATE',
    }
  }
  return {
    success: false,
    error: error.message || 'Database operation failed',
    errorType: 'UNKNOWN',
  }
}

// Helper function to parse JSON fields and handle double encoding
function parseJsonField(value: any): any {
  if (!value || typeof value !== 'string') {
    return value
  }

  try {
    let parsed = JSON.parse(value)
    // Check if it's double-encoded (parsed result is still a string)
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed)
    }
    return parsed
  } catch (error) {
    console.error('[InteractionsTable] Failed to parse JSON field:', error)
    return null
  }
}

// Helper function to parse interaction JSON fields
function parseInteractionJsonFields(interaction: Interaction): Interaction {
  interaction.asr_output = parseJsonField(interaction.asr_output)
  interaction.llm_output = parseJsonField(interaction.llm_output)
  return interaction
}

// =================================================================
// Interactions
// =================================================================

/**
 * Data required to create a new Interaction.
 * The repository will handle the rest of the fields.
 */
type InsertInteraction = Omit<
  Interaction,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
>

export class InteractionsTable {
  static async insert(
    interactionData: InsertInteraction,
  ): Promise<Interaction> {
    const newInteraction: Interaction = {
      id: uuidv4(),
      ...interactionData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }

    const query = `
      INSERT INTO interactions (id, user_id, title, asr_output, llm_output, raw_audio, raw_audio_id, duration_ms, sample_rate, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    // Note: SQLite doesn't have a dedicated JSON type, so we stringify complex objects
    const params = [
      newInteraction.id,
      newInteraction.user_id,
      newInteraction.title,
      JSON.stringify(newInteraction.asr_output),
      JSON.stringify(newInteraction.llm_output),
      newInteraction.raw_audio,
      newInteraction.raw_audio_id,
      newInteraction.duration_ms,
      newInteraction.sample_rate,
      newInteraction.created_at,
      newInteraction.updated_at,
      newInteraction.deleted_at,
    ]

    await run(query, params)
    return newInteraction
  }

  static async findById(id: string): Promise<Interaction | undefined> {
    const row = await get<Interaction>(
      'SELECT * FROM interactions WHERE id = ?',
      [id],
    )
    return row ? parseInteractionJsonFields(row) : undefined
  }

  static async findAll(user_id?: string): Promise<Interaction[]> {
    const query = user_id
      ? 'SELECT * FROM interactions WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
      : 'SELECT * FROM interactions WHERE user_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC'
    const params = user_id ? [user_id] : []
    const rows = await all<Interaction>(query, params)

    return rows.map(parseInteractionJsonFields)
  }

  static async softDelete(id: string): Promise<void> {
    const query =
      'UPDATE interactions SET deleted_at = ?, updated_at = ? WHERE id = ?'
    await run(query, [new Date().toISOString(), new Date().toISOString(), id])
  }

  static async deleteAllUserData(userId: string): Promise<void> {
    const query =
      'UPDATE interactions SET deleted_at = ?, updated_at = ? WHERE user_id = ?'
    await run(query, [
      new Date().toISOString(),
      new Date().toISOString(),
      userId,
    ])
  }

  static async findModifiedSince(timestamp: string): Promise<Interaction[]> {
    const rows = await all<Interaction>(
      'SELECT * FROM interactions WHERE updated_at > ?',
      [timestamp],
    )

    return rows.map(parseInteractionJsonFields)
  }

  static async upsert(interaction: Interaction): Promise<void> {
    const query = `
      INSERT INTO interactions (id, user_id, title, asr_output, llm_output, raw_audio, duration_ms, sample_rate, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        asr_output = excluded.asr_output,
        llm_output = excluded.llm_output,
        raw_audio = excluded.raw_audio,
        duration_ms = excluded.duration_ms,
        sample_rate = excluded.sample_rate,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at;
    `
    const params = [
      interaction.id,
      interaction.user_id,
      interaction.title,
      JSON.stringify(interaction.asr_output),
      JSON.stringify(interaction.llm_output),
      interaction.raw_audio,
      interaction.duration_ms,
      interaction.sample_rate,
      interaction.created_at,
      interaction.updated_at,
      interaction.deleted_at,
    ]

    await run(query, params)
  }
}

// =================================================================
// Notes
// =================================================================

/**
 * Data required to create a new Note.
 */
type InsertNote = Omit<Note, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>

export class NotesTable {
  static async insert(noteData: InsertNote): Promise<Note> {
    const newNote: Note = {
      id: uuidv4(),
      ...noteData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }

    const query = `
            INSERT INTO notes (id, user_id, interaction_id, content, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `
    const params = [
      newNote.id,
      newNote.user_id,
      newNote.interaction_id,
      newNote.content,
      newNote.created_at,
      newNote.updated_at,
      newNote.deleted_at,
    ]

    await run(query, params)
    return newNote
  }

  static async findById(id: string): Promise<Note | undefined> {
    return await get<Note>('SELECT * FROM notes WHERE id = ?', [id])
  }

  static async findAll(user_id?: string): Promise<Note[]> {
    const query = user_id
      ? 'SELECT * FROM notes WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
      : 'SELECT * FROM notes WHERE user_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC'
    const params = user_id ? [user_id] : []
    return await all<Note>(query, params)
  }

  static async findByInteractionId(interactionId: string): Promise<Note[]> {
    return await all<Note>(
      'SELECT * FROM notes WHERE interaction_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
      [interactionId],
    )
  }

  static async updateContent(id: string, content: string): Promise<void> {
    const query = 'UPDATE notes SET content = ?, updated_at = ? WHERE id = ?'
    await run(query, [
      typeof content === 'string' ? content : JSON.stringify(content),
      new Date().toISOString(),
      id,
    ])
  }

  static async softDelete(id: string): Promise<void> {
    console.log('softDelete', id)
    const query = 'UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?'
    await run(query, [new Date().toISOString(), new Date().toISOString(), id])
  }

  static async deleteAllUserData(userId: string): Promise<void> {
    const query =
      'UPDATE notes SET deleted_at = ?, updated_at = ? WHERE user_id = ?'
    await run(query, [
      new Date().toISOString(),
      new Date().toISOString(),
      userId,
    ])
  }

  static async findModifiedSince(timestamp: string): Promise<Note[]> {
    return await all<Note>('SELECT * FROM notes WHERE updated_at > ?', [
      timestamp,
    ])
  }

  static async upsert(note: Note): Promise<void> {
    const query = `
      INSERT INTO notes (id, user_id, interaction_id, content, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        interaction_id = excluded.interaction_id,
        content = excluded.content,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at;
    `
    const params = [
      note.id,
      note.user_id,
      note.interaction_id,
      note.content,
      note.created_at,
      note.updated_at,
      note.deleted_at,
    ]
    await run(query, params)
  }
}

// =================================================================
// Dictionary
// =================================================================

/**
 * Data required to create a new Dictionary Item.
 */
type InsertDictionaryItem = Omit<
  DictionaryItem,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
>

export class DictionaryTable {
  static async insert(
    itemData: InsertDictionaryItem,
  ): Promise<DbResult<DictionaryItem>> {
    const newItem: DictionaryItem = {
      id: uuidv4(),
      ...itemData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }

    const query = `
            INSERT INTO dictionary_items (id, user_id, word, pronunciation, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `
    const params = [
      newItem.id,
      newItem.user_id,
      newItem.word,
      newItem.pronunciation,
      newItem.created_at,
      newItem.updated_at,
      newItem.deleted_at,
    ]

    try {
      await run(query, params)
      return { success: true, data: newItem }
    } catch (error: any) {
      return handleDictionaryConstraintError(error, newItem.word)
    }
  }

  static async findAll(user_id?: string): Promise<DictionaryItem[]> {
    const query = user_id
      ? 'SELECT * FROM dictionary_items WHERE user_id = ? AND deleted_at IS NULL ORDER BY word ASC'
      : 'SELECT * FROM dictionary_items WHERE user_id IS NULL AND deleted_at IS NULL ORDER BY word ASC'
    const params = user_id ? [user_id] : []
    return await all<DictionaryItem>(query, params)
  }

  static async update(
    id: string,
    word: string,
    pronunciation: string | null,
  ): Promise<DbResult<void>> {
    const query =
      'UPDATE dictionary_items SET word = ?, pronunciation = ?, updated_at = ? WHERE id = ?'
    try {
      await run(query, [word, pronunciation, new Date().toISOString(), id])
      return { success: true, data: undefined }
    } catch (error: any) {
      return handleDictionaryConstraintError(error, word)
    }
  }

  static async softDelete(id: string): Promise<void> {
    const now = new Date().toISOString()
    const query =
      'UPDATE dictionary_items SET deleted_at = ?, updated_at = ? WHERE id = ?'
    await run(query, [now, now, id])
  }

  static async deleteAllUserData(userId: string): Promise<void> {
    const now = new Date().toISOString()
    const query =
      'UPDATE dictionary_items SET deleted_at = ?, updated_at = ? WHERE user_id = ?'
    await run(query, [now, now, userId])
  }

  static async findModifiedSince(timestamp: string): Promise<DictionaryItem[]> {
    return await all<DictionaryItem>(
      'SELECT * FROM dictionary_items WHERE updated_at > ?',
      [timestamp],
    )
  }

  static async upsert(item: DictionaryItem): Promise<DbResult<void>> {
    const query = `
      INSERT INTO dictionary_items (id, user_id, word, pronunciation, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        word = excluded.word,
        pronunciation = excluded.pronunciation,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at;
    `
    const params = [
      item.id,
      item.user_id,
      item.word,
      item.pronunciation,
      item.created_at,
      item.updated_at,
      item.deleted_at,
    ]
    try {
      await run(query, params)
      return { success: true, data: undefined }
    } catch (error: any) {
      return handleDictionaryConstraintError(error, item.word)
    }
  }
}

// =================================================================
// KeyValueStore
// =================================================================

export class KeyValueStore {
  static async set(key: string, value: string): Promise<void> {
    const query = `
      INSERT INTO key_value_store (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `
    await run(query, [key, value])
  }

  static async get(key: string): Promise<string | undefined> {
    const row = await get<{ value: string }>(
      'SELECT value FROM key_value_store WHERE key = ?',
      [key],
    )
    return row?.value
  }

  static async delete(key: string): Promise<void> {
    const query = 'DELETE FROM key_value_store WHERE key = ?'
    await run(query, [key])
  }
}

// =================================================================
// UserMetadata
// =================================================================

/**
 * Raw UserMetadata row from SQLite (dates are strings).
 */
type UserMetadataRow = {
  id: string
  user_id: string
  paid_status: PaidStatus
  free_words_remaining: number | null
  pro_trial_start_date: string | null
  pro_trial_end_date: string | null
  pro_subscription_start_date: string | null
  pro_subscription_end_date: string | null
  created_at: string
  updated_at: string
}

/**
 * Transforms a raw DB row to UserMetadata with Date objects.
 */
function parseUserMetadataRow(row: UserMetadataRow): UserMetadata {
  return {
    ...row,
    pro_trial_start_date: row.pro_trial_start_date
      ? new Date(row.pro_trial_start_date)
      : null,
    pro_trial_end_date: row.pro_trial_end_date
      ? new Date(row.pro_trial_end_date)
      : null,
    pro_subscription_start_date: row.pro_subscription_start_date
      ? new Date(row.pro_subscription_start_date)
      : null,
    pro_subscription_end_date: row.pro_subscription_end_date
      ? new Date(row.pro_subscription_end_date)
      : null,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  }
}

/**
 * Data required to create or update UserMetadata.
 */
type InsertUserMetadata = Omit<UserMetadata, 'id' | 'created_at' | 'updated_at'>

export class UserMetadataTable {
  static async insert(metadataData: InsertUserMetadata): Promise<UserMetadata> {
    const now = new Date()
    const newMetadata: UserMetadata = {
      id: uuidv4(),
      ...metadataData,
      created_at: now,
      updated_at: now,
    }

    const query = `
      INSERT INTO user_metadata (
        id, user_id, paid_status, free_words_remaining,
        pro_trial_start_date, pro_trial_end_date,
        pro_subscription_start_date, pro_subscription_end_date,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const params = [
      newMetadata.id,
      newMetadata.user_id,
      newMetadata.paid_status,
      newMetadata.free_words_remaining,
      newMetadata.pro_trial_start_date?.toISOString() ?? null,
      newMetadata.pro_trial_end_date?.toISOString() ?? null,
      newMetadata.pro_subscription_start_date?.toISOString() ?? null,
      newMetadata.pro_subscription_end_date?.toISOString() ?? null,
      newMetadata.created_at.toISOString(),
      newMetadata.updated_at.toISOString(),
    ]

    await run(query, params)
    return newMetadata
  }

  static async findByUserId(userId: string): Promise<UserMetadata | undefined> {
    const row = await get<UserMetadataRow>(
      'SELECT * FROM user_metadata WHERE user_id = ?',
      [userId],
    )
    return row ? parseUserMetadataRow(row) : undefined
  }

  /**
   * Allows updating specific fields of user metadata. If
   * the field is not provided, it will remain unchanged.
   */
  static async update(
    userId: string,
    updates: Partial<Omit<UserMetadata, 'id' | 'user_id' | 'created_at'>>,
  ): Promise<void> {
    const fields: string[] = []
    const params: any[] = []

    if (updates.paid_status !== undefined) {
      fields.push('paid_status = ?')
      params.push(updates.paid_status)
    }
    if (updates.free_words_remaining !== undefined) {
      fields.push('free_words_remaining = ?')
      params.push(updates.free_words_remaining)
    }
    if (updates.pro_trial_start_date !== undefined) {
      fields.push('pro_trial_start_date = ?')
      params.push(updates.pro_trial_start_date?.toISOString() ?? null)
    }
    if (updates.pro_trial_end_date !== undefined) {
      fields.push('pro_trial_end_date = ?')
      params.push(updates.pro_trial_end_date?.toISOString() ?? null)
    }
    if (updates.pro_subscription_start_date !== undefined) {
      fields.push('pro_subscription_start_date = ?')
      params.push(updates.pro_subscription_start_date?.toISOString() ?? null)
    }
    if (updates.pro_subscription_end_date !== undefined) {
      fields.push('pro_subscription_end_date = ?')
      params.push(updates.pro_subscription_end_date?.toISOString() ?? null)
    }

    fields.push('updated_at = ?')
    params.push(new Date().toISOString())

    params.push(userId)

    const query = `UPDATE user_metadata SET ${fields.join(', ')} WHERE user_id = ?`
    await run(query, params)
  }

  static async upsert(metadata: UserMetadata): Promise<void> {
    const query = `
      INSERT INTO user_metadata (
        id, user_id, paid_status, free_words_remaining,
        pro_trial_start_date, pro_trial_end_date,
        pro_subscription_start_date, pro_subscription_end_date,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        paid_status = excluded.paid_status,
        free_words_remaining = excluded.free_words_remaining,
        pro_trial_start_date = excluded.pro_trial_start_date,
        pro_trial_end_date = excluded.pro_trial_end_date,
        pro_subscription_start_date = excluded.pro_subscription_start_date,
        pro_subscription_end_date = excluded.pro_subscription_end_date,
        updated_at = excluded.updated_at;
    `
    const params = [
      metadata.id,
      metadata.user_id,
      metadata.paid_status,
      metadata.free_words_remaining,
      metadata.pro_trial_start_date?.toISOString() ?? null,
      metadata.pro_trial_end_date?.toISOString() ?? null,
      metadata.pro_subscription_start_date?.toISOString() ?? null,
      metadata.pro_subscription_end_date?.toISOString() ?? null,
      metadata.created_at.toISOString(),
      metadata.updated_at.toISOString(),
    ]

    await run(query, params)
  }

  static async deleteByUserId(userId: string): Promise<void> {
    const query = 'DELETE FROM user_metadata WHERE user_id = ?'
    await run(query, [userId])
  }
}
