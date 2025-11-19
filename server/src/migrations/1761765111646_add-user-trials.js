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
  pgm.createTable('user_trials', {
    user_id: { type: 'text', notNull: true, unique: true },
    trial_start_at: { type: 'timestamptz' },
    trial_end_at: { type: 'timestamptz' },
    has_completed_trial: { type: 'boolean', notNull: true, default: false },
    stripe_subscription_id: { type: 'text', unique: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  })

  // Index for lookups by user
  pgm.createIndex('user_trials', 'user_id')
  // Index for lookups by Stripe subscription ID
  pgm.createIndex('user_trials', 'stripe_subscription_id')
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = pgm => {
  pgm.dropTable('user_trials')
}
