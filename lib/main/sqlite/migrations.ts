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
]
