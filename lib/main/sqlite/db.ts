import sqlite3 from 'sqlite3'
import { app } from 'electron'
import path from 'path'
import { promises as fs } from 'fs'
import { INITIAL_SCHEMA } from './schema'
import { MIGRATIONS, Migration } from './migrations'
import { run, exec, get, all } from './utils'

const DB_FILE = 'ito.db'
const dbPath = path.join(app.getPath('userData'), DB_FILE)

let db: sqlite3.Database

const runMigrations = async () => {
  // 1. Create migrations table if it doesn't exist
  await run(
    'CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  )

  // 2. Get applied migrations
  const appliedMigrations = await all<{ id: string }>(
    'SELECT id FROM migrations',
  )
  const appliedMigrationIds = new Set(appliedMigrations.map((row) => row.id))

  // 3. Define all migrations, including initial schema as the first one
  const allMigrations: Migration[] = [
    {
      id: '0000_initial_schema',
      up: INITIAL_SCHEMA,
      down: `
        DROP TABLE IF EXISTS notes;
        DROP TABLE IF EXISTS dictionary_items;
        DROP TABLE IF EXISTS interactions;
      `,
    },
    ...MIGRATIONS,
  ]

  // 4. Filter out migrations that have already been applied
  const pendingMigrations = allMigrations.filter(
    (m) => !appliedMigrationIds.has(m.id),
  )

  if (pendingMigrations.length === 0) {
    console.info('Database schema is up to date.')
    return
  }

  // 5. Apply pending migrations
  console.info(`Found ${pendingMigrations.length} pending migrations. Applying...`)

  for (const migration of pendingMigrations) {
    console.info(`Applying migration: ${migration.id}`)
    try {
      // We use exec for migrations that might contain multiple statements
      // like the initial schema.
      await exec('BEGIN;')
      await exec(migration.up)
      await run('INSERT INTO migrations (id, applied_at) VALUES (?, ?)', [
        migration.id,
        new Date().toISOString(),
      ])
      await exec('COMMIT;')
      console.info(`Migration ${migration.id} applied successfully.`)
    } catch (err) {
      console.error(`Failed to apply migration ${migration.id}:`, err)
      // Rollback transaction on error
      await exec('ROLLBACK;')
      throw new Error(`Migration ${migration.id} failed.`)
    }
  }
}

const revertLastMigration = async () => {
  // 1. Get the last applied migration
  const lastMigration = await get<{ id: string }>(
    'SELECT id FROM migrations ORDER BY applied_at DESC LIMIT 1',
  )

  if (!lastMigration) {
    console.info('No migrations to revert.')
    return
  }

  // 2. Define all migrations to find the one to revert
  const allMigrations: Migration[] = [
    {
      id: '0000_initial_schema',
      up: INITIAL_SCHEMA,
      down: `
        DROP TABLE IF EXISTS notes;
        DROP TABLE IF EXISTS dictionary_items;
        DROP TABLE IF EXISTS interactions;
      `,
    },
    ...MIGRATIONS,
  ]
  const migrationToRevert = allMigrations.find(
    (m) => m.id === lastMigration.id,
  )

  if (!migrationToRevert) {
    throw new Error(
      `Migration with id ${lastMigration.id} found in DB but not in code.`,
    )
  }

  // We are not allowing reverting the initial schema for safety.
  if (migrationToRevert.id === '0000_initial_schema') {
    console.error(
      'Cannot revert initial schema. To reset the database, delete the database file.',
    )
    throw new Error('Reverting the initial schema is not supported.')
  }

  // 3. Apply the 'down' script in a transaction
  console.info(`Reverting migration: ${migrationToRevert.id}`)
  try {
    await exec('BEGIN;')
    await exec(migrationToRevert.down)
    await run('DELETE FROM migrations WHERE id = ?', [migrationToRevert.id])
    await exec('COMMIT;')
    console.info(
      `Migration ${migrationToRevert.id} reverted successfully. App will quit, please relaunch.`,
    )
    app.quit()
  } catch (err) {
    console.error(`Failed to revert migration ${migrationToRevert.id}:`, err)
    await exec('ROLLBACK;')
    throw new Error(`Migration ${migrationToRevert.id} revert failed.`)
  }
}

const wipeDatabase = async () => {
  if (db) {
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) return reject(err)
        resolve()
      })
    })
    console.info('Database connection closed.')
  }

  try {
    await fs.unlink(dbPath)
    console.info('Database file deleted.')
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error
    }
    console.info('Database file did not exist, skipping deletion.')
  }

  console.info('Database wiped. Application will now quit, please relaunch.')
  app.quit()
}

const initializeDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Failed to connect to SQLite database.', err)
        reject(err)
      } else {
        console.info('Connected to SQLite database.')
        runMigrations()
          .then(resolve)
          .catch((e) => {
            console.error('Failed to run migrations.', e)
            reject(e)
          })
      }
    })
  })
}

const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return db
}

export { initializeDatabase, getDb, revertLastMigration, wipeDatabase } 