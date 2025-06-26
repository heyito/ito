import { run, get, all } from './utils'
import type { Interaction, Note, DictionaryItem } from './models'
import { v4 as uuidv4 } from 'uuid'

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
      INSERT INTO interactions (id, user_id, title, asr_output, llm_output, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    // Note: SQLite doesn't have a dedicated JSON type, so we stringify complex objects
    const params = [
      newInteraction.id,
      newInteraction.user_id,
      newInteraction.title,
      JSON.stringify(newInteraction.asr_output),
      JSON.stringify(newInteraction.llm_output),
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
    if (row) {
      // JSON fields must be parsed
      row.asr_output = row.asr_output
        ? JSON.parse(row.asr_output as string)
        : null
      row.llm_output = row.llm_output
        ? JSON.parse(row.llm_output as string)
        : null
    }
    return row
  }

  static async findAll(): Promise<Interaction[]> {
    const rows = await all<Interaction>(
      'SELECT * FROM interactions WHERE deleted_at IS NULL ORDER BY created_at DESC',
    )
    return rows.map((row) => {
      // JSON fields must be parsed
      row.asr_output = row.asr_output
        ? JSON.parse(row.asr_output as string)
        : null
      row.llm_output = row.llm_output
        ? JSON.parse(row.llm_output as string)
        : null
      return row
    })
  }

  static async softDelete(id: string): Promise<void> {
    const query =
      'UPDATE interactions SET deleted_at = ?, updated_at = ? WHERE id = ?'
    await run(query, [new Date().toISOString(), new Date().toISOString(), id])
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

  static async findAll(): Promise<Note[]> {
    return await all<Note>(
      'SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY created_at DESC',
    )
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
    const query = 'UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?'
    await run(query, [new Date().toISOString(), new Date().toISOString(), id])
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
  static async insert(itemData: InsertDictionaryItem): Promise<DictionaryItem> {
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

    await run(query, params)
    return newItem
  }

  static async findAll(): Promise<DictionaryItem[]> {
    return await all<DictionaryItem>(
      'SELECT * FROM dictionary_items WHERE deleted_at IS NULL ORDER BY word ASC',
    )
  }

  static async update(
    id: string,
    word: string,
    pronunciation: string | null,
  ): Promise<void> {
    const query =
      'UPDATE dictionary_items SET word = ?, pronunciation = ?, updated_at = ? WHERE id = ?'
    await run(query, [word, pronunciation, new Date().toISOString(), id])
  }

  static async softDelete(id: string): Promise<void> {
    const query =
      'UPDATE dictionary_items SET deleted_at = ?, updated_at = ? WHERE id = ?'
    await run(query, [new Date().toISOString(), new Date().toISOString(), id])
  }
}
