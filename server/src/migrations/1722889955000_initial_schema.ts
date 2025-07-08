import { type MigrationBuilder } from 'node-pg-migrate'
import { INITIAL_SCHEMA_UP, INITIAL_SCHEMA_DOWN } from '../db/schema.js'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(INITIAL_SCHEMA_UP)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(INITIAL_SCHEMA_DOWN)
}
