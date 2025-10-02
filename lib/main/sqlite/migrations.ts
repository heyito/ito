export interface Migration {
  id: string
  up: string
  down: string
}

export const MIGRATIONS: Migration[] = [
  {
    id: '20250108120000_add_raw_audio_to_interactions',
    up: 'ALTER TABLE interactions ADD COLUMN raw_audio BLOB;',
    down: 'ALTER TABLE interactions DROP COLUMN raw_audio;',
  },
  {
    id: '20250108130000_add_duration_to_interactions',
    up: 'ALTER TABLE interactions ADD COLUMN duration_ms INTEGER DEFAULT 0;',
    down: 'ALTER TABLE interactions DROP COLUMN duration_ms;',
  },
  {
    id: '20250110120000_add_sample_rate_to_interactions',
    up: 'ALTER TABLE interactions ADD COLUMN sample_rate INTEGER;',
    down: 'ALTER TABLE interactions DROP COLUMN sample_rate;',
  },
  {
    id: '20250111120000_add_raw_audio_id_to_interactions',
    up: 'ALTER TABLE interactions ADD COLUMN raw_audio_id TEXT;',
    down: 'ALTER TABLE interactions DROP COLUMN raw_audio_id;',
  },
  {
    id: '20250923091139_make_dictionary_word_unique',
    up: `
      -- Delete duplicate entries, keeping only the most recent one (highest id)
      DELETE FROM dictionary_items
      WHERE id NOT IN (
        SELECT MAX(id)
        FROM dictionary_items
        WHERE deleted_at IS NULL
        GROUP BY word
      )
      AND deleted_at IS NULL;

      -- Now create the unique index
      CREATE UNIQUE INDEX idx_dictionary_items_word_unique ON dictionary_items(word) WHERE deleted_at IS NULL;
    `,
    down: 'DROP INDEX idx_dictionary_items_word_unique;',
  },
]
