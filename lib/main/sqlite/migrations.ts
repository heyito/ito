export interface Migration {
  id: string
  up: string
  down: string
}

export const MIGRATIONS: Migration[] = [
  // Example of a future migration:
  // {
  //   id: '20240726120000_add_tags_to_notes',
  //   up: 'ALTER TABLE notes ADD COLUMN tags TEXT;',
  //   down: 'ALTER TABLE notes DROP COLUMN tags;'
  // }
]
