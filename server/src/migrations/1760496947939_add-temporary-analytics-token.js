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
  // IP correlation candidates (privacy: store only hashed IP)
  pgm.createTable('ip_link_candidates', {
    ip_hash: { type: 'text', notNull: true },
    website_distinct_id: { type: 'text', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
  })
  pgm.createIndex('ip_link_candidates', ['ip_hash', 'expires_at'], {
    ifNotExists: true,
    name: 'ip_link_candidates_ip_exp_idx',
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = pgm => {
  pgm.dropTable('ip_link_candidates', { ifExists: true })
}
