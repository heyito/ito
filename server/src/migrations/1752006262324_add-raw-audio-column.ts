import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('interactions', {
    raw_audio: {
      type: 'bytea',
      notNull: false,
    },
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('interactions', 'raw_audio')
}
