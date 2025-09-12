/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = pgm => {
  // Add new column for storing reference UUID instead of raw audio blob
  pgm.addColumn('interactions', {
    raw_audio_id: {
      type: 'uuid',
      notNull: false,
      comment: 'Reference to audio file stored in S3',
    },
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = pgm => {
  // Drop the column
  pgm.dropColumn('interactions', 'raw_audio_id')
}
