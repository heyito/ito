import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add duration_ms column to interactions table
  pgm.addColumn('interactions', {
    duration_ms: {
      type: 'integer',
      default: 0,
      notNull: false,
    },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Remove duration_ms column from interactions table
  pgm.dropColumn('interactions', 'duration_ms')
}
