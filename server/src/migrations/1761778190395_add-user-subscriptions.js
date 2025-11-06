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
  pgm.createTable('user_subscriptions', {
    user_id: { type: 'text', notNull: true, unique: true },
    stripe_customer_id: { type: 'text' },
    stripe_subscription_id: { type: 'text' },
    subscription_start_at: { type: 'timestamptz' },
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

  pgm.createIndex('user_subscriptions', 'user_id')
  pgm.createIndex('user_subscriptions', 'stripe_subscription_id')
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = pgm => {
  pgm.dropIndex('user_subscriptions', 'stripe_subscription_id')
  pgm.dropIndex('user_subscriptions', 'user_id')
  pgm.dropTable('user_subscriptions')
}
