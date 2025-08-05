import pool from '../db.js'
import {
  Note,
  Interaction,
  DictionaryItem,
  LlmSettings,
  AdvancedSettings,
} from './models.js'
import {
  CreateNoteRequest,
  UpdateNoteRequest,
  CreateInteractionRequest,
  UpdateInteractionRequest,
  CreateDictionaryItemRequest,
  UpdateDictionaryItemRequest,
  UpdateAdvancedSettingsRequest,
} from '../generated/ito_pb.js'

export class NotesRepository {
  static async create(
    noteData: CreateNoteRequest & { userId: string },
  ): Promise<Note> {
    const res = await pool.query<Note>(
      `INSERT INTO notes (id, user_id, interaction_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        noteData.id,
        noteData.userId,
        noteData.interactionId || null,
        noteData.content,
      ],
    )
    return res.rows[0]
  }

  static async findById(id: string): Promise<Note | undefined> {
    const res = await pool.query<Note>('SELECT * FROM notes WHERE id = $1', [
      id,
    ])
    return res.rows[0]
  }

  static async findByUserId(userId: string, since?: Date): Promise<Note[]> {
    let query = 'SELECT * FROM notes WHERE user_id = $1'
    const params: any[] = [userId]

    if (since) {
      query += ' AND (updated_at > $2 OR deleted_at > $2)'
      params.push(since)
    }

    query += ' ORDER BY updated_at ASC'

    const res = await pool.query<Note>(query, params)
    return res.rows
  }

  static async update(noteData: UpdateNoteRequest): Promise<Note | undefined> {
    const res = await pool.query<Note>(
      `UPDATE notes
       SET content = $1, updated_at = current_timestamp
       WHERE id = $2
       RETURNING *`,
      [noteData.content, noteData.id],
    )
    return res.rows[0]
  }

  static async softDelete(id: string): Promise<boolean> {
    const res = await pool.query(
      `UPDATE notes
       SET deleted_at = current_timestamp
       WHERE id = $1`,
      [id],
    )
    return (res.rowCount ?? 0) > 0
  }

  static async deleteAllUserData(userId: string): Promise<boolean> {
    const res = await pool.query(
      `UPDATE notes
       SET deleted_at = current_timestamp
       WHERE user_id = $1`,
      [userId],
    )
    return (res.rowCount ?? 0) > 0
  }
}

export class InteractionsRepository {
  static async create(
    interactionData: CreateInteractionRequest & { userId: string },
  ): Promise<Interaction> {
    const res = await pool.query<Interaction>(
      `INSERT INTO interactions (id, user_id, title, asr_output, llm_output, raw_audio, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        interactionData.id,
        interactionData.userId,
        interactionData.title,
        interactionData.asrOutput,
        interactionData.llmOutput,
        interactionData.rawAudio,
        interactionData.durationMs ?? 0,
      ],
    )
    return res.rows[0]
  }

  static async findById(id: string): Promise<Interaction | undefined> {
    const res = await pool.query<Interaction>(
      'SELECT * FROM interactions WHERE id = $1 AND deleted_at IS NULL',
      [id],
    )
    return res.rows[0]
  }

  static async findByUserId(
    userId: string,
    since?: Date,
  ): Promise<Interaction[]> {
    let query = 'SELECT * FROM interactions WHERE user_id = $1'
    const params: any[] = [userId]

    if (since) {
      query += ' AND (updated_at > $2 OR deleted_at > $2)'
      params.push(since)
    }

    query += ' ORDER BY updated_at ASC'

    const res = await pool.query<Interaction>(query, params)
    return res.rows
  }

  static async update(
    interactionData: UpdateInteractionRequest,
  ): Promise<Interaction | undefined> {
    const res = await pool.query<Interaction>(
      `UPDATE interactions
       SET title = $1, updated_at = current_timestamp
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [interactionData.title, interactionData.id],
    )
    return res.rows[0]
  }

  static async softDelete(id: string): Promise<boolean> {
    const res = await pool.query(
      `UPDATE interactions
       SET deleted_at = current_timestamp
       WHERE id = $1`,
      [id],
    )
    return (res.rowCount ?? 0) > 0
  }

  static async deleteAllUserData(userId: string): Promise<boolean> {
    const res = await pool.query(
      `UPDATE interactions
       SET deleted_at = current_timestamp
       WHERE user_id = $1`,
      [userId],
    )
    return (res.rowCount ?? 0) > 0
  }
}

export class DictionaryRepository {
  static async create(
    itemData: CreateDictionaryItemRequest & { userId: string },
  ): Promise<DictionaryItem> {
    const res = await pool.query<DictionaryItem>(
      `INSERT INTO dictionary_items (id, user_id, word, pronunciation)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [itemData.id, itemData.userId, itemData.word, itemData.pronunciation],
    )
    return res.rows[0]
  }

  static async findByUserId(
    userId: string,
    since?: Date,
  ): Promise<DictionaryItem[]> {
    let query = 'SELECT * FROM dictionary_items WHERE user_id = $1'
    const params: any[] = [userId]

    if (since) {
      query += ' AND (updated_at > $2 OR deleted_at > $2)'
      params.push(since)
    }

    query += ' ORDER BY updated_at ASC'

    const res = await pool.query<DictionaryItem>(query, params)
    return res.rows
  }

  static async update(
    itemData: UpdateDictionaryItemRequest,
  ): Promise<DictionaryItem | undefined> {
    const res = await pool.query<DictionaryItem>(
      `UPDATE dictionary_items
       SET word = $1, pronunciation = $2, updated_at = current_timestamp
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [itemData.word, itemData.pronunciation, itemData.id],
    )
    return res.rows[0]
  }

  static async softDelete(id: string): Promise<boolean> {
    const res = await pool.query(
      `UPDATE dictionary_items
       SET deleted_at = current_timestamp
       WHERE id = $1`,
      [id],
    )
    return (res.rowCount ?? 0) > 0
  }

  static async deleteAllUserData(userId: string): Promise<boolean> {
    const res = await pool.query(
      `UPDATE dictionary_items
       SET deleted_at = current_timestamp
       WHERE user_id = $1`,
      [userId],
    )
    return (res.rowCount ?? 0) > 0
  }
}

export class AdvancedSettingsRepository {
  static async findByUserId(
    userId: string,
  ): Promise<AdvancedSettings | undefined> {
    const res = await pool.query<LlmSettings>(
      'SELECT * FROM llm_settings WHERE user_id = $1',
      [userId],
    )

    if (res.rows.length === 0) {
      return undefined
    }

    const llmSettings = res.rows[0]
    return {
      id: llmSettings.id,
      user_id: llmSettings.user_id,
      llm: {
        asr_model: llmSettings.asr_model,
      },
      created_at: llmSettings.created_at,
      updated_at: llmSettings.updated_at,
    }
  }

  static async upsert(
    userId: string,
    settingsData: UpdateAdvancedSettingsRequest,
  ): Promise<AdvancedSettings> {
    const res = await pool.query<LlmSettings>(
      `INSERT INTO llm_settings (user_id, asr_model, updated_at)
       VALUES ($1, $2, current_timestamp)
       ON CONFLICT (user_id)
       DO UPDATE SET
         asr_model = EXCLUDED.asr_model,
         updated_at = current_timestamp
       RETURNING *`,
      [userId, settingsData.llm?.asrModel || 'whisper-large-v3'],
    )

    const llmSettings = res.rows[0]
    return {
      id: llmSettings.id,
      user_id: llmSettings.user_id,
      llm: {
        asr_model: llmSettings.asr_model,
      },
      created_at: llmSettings.created_at,
      updated_at: llmSettings.updated_at,
    }
  }
}
