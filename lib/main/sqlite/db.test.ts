import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock electron BEFORE importing db.ts
mock.module('electron', () => ({
  app: {
    getPath: mock((type: string) => {
      if (type === 'userData') return '/tmp/test-ito-app'
      return '/tmp/test-path'
    }),
    quit: mock(),
  },
}))

// Mock other dependencies
mock.module('../../clients/grpcClient', () => ({
  grpcClient: {
    deleteUserData: mock(),
  },
}))

mock.module('electron-store', () => {
  const MockStore = function (this: any) {
    this.data = new Map()
  }
  MockStore.prototype.get = mock(function (this: any, key: any) {
    return this.data.get(key)
  })
  MockStore.prototype.set = mock(function (this: any, key: any, value: any) {
    this.data.set(key, value)
  })
  return { default: MockStore }
})

mock.module('../store', () => ({
  default: { get: mock(), set: mock() },
  getCurrentUserId: mock(() => 'test-user-123'),
}))

// Mock file system
const mockFs = {
  unlink: mock(),
  mkdir: mock(() => Promise.resolve()),
}
mock.module('fs', () => ({
  promises: mockFs,
}))

// Mock database utilities - minimal mocking for business logic tests
const mockRun = mock()
const mockExec = mock()
const mockGet = mock()
const mockAll = mock()

mock.module('./utils', () => ({
  run: mockRun,
  exec: mockExec,
  get: mockGet,
  all: mockAll,
}))

// Mock sqlite3 with basic functionality
const mockSqliteDatabase: any = {
  close: mock((callback?: (err: Error | null) => void) => {
    if (callback) {
      setTimeout(() => {
        callback(null)
      }, 10)
    }
  }),
  run: mock(),
  exec: mock(),
}

mock.module('sqlite3', () => ({
  default: {
    Database: mock((_path: string, callback?: (err: Error | null) => void) => {
      setTimeout(() => callback?.(null), 0)
      return mockSqliteDatabase
    }),
  },
}))

// Test data for migrations
const MOCK_MIGRATIONS = [
  {
    id: '20250108120000_add_raw_audio_to_interactions',
    up: 'ALTER TABLE interactions ADD COLUMN raw_audio BLOB;',
    down: 'ALTER TABLE interactions DROP COLUMN raw_audio;',
  },
  {
    id: '20250108130000_add_duration_to_interactions',
    up: 'ALTER TABLE interactions ADD COLUMN duration_ms INTEGER DEFAULT 0;',
    down: 'ALTER TABLE interactions DROP COLUMN duration_ms;',
  },
]

mock.module('./migrations', () => ({
  MIGRATIONS: MOCK_MIGRATIONS,
}))

mock.module('./schema', () => ({
  INITIAL_SCHEMA: `CREATE TABLE interactions (id TEXT PRIMARY KEY);`,
}))

import {
  initializeDatabase,
  getDb,
  revertLastMigration,
  wipeDatabase,
} from './db'
import path from 'path'

describe('Database State Management', () => {
  beforeEach(() => {
    // Clear all mocks
    mockRun.mockClear()
    mockExec.mockClear()
    mockGet.mockClear()
    mockAll.mockClear()
    mockFs.unlink.mockClear()

    // Reset module state by clearing require cache
    delete require.cache[require.resolve('./db')]
  })

  test('should throw error when accessing uninitialized database', async () => {
    // Import fresh module to ensure uninitialized state
    const { getDb: freshGetDb } = await import('./db')

    expect(() => freshGetDb()).toThrow(
      'Database not initialized. Call initializeDatabase() first.',
    )
  })

  test('should allow database access after initialization', async () => {
    mockAll.mockResolvedValue([]) // No existing migrations
    mockRun.mockResolvedValue(undefined)
    mockExec.mockResolvedValue(undefined)

    await initializeDatabase()
    const db = getDb()

    expect(db).toBeDefined()
    expect(db).toBe(mockSqliteDatabase)
  })

  test('should handle database connection errors', async () => {
    // Mock database connection failure
    const failingDatabase = mock(
      (_path: string, callback?: (err: Error | null) => void) => {
        setTimeout(() => callback?.(new Error('Connection failed')), 0)
        return mockSqliteDatabase
      },
    )

    // Temporarily replace the Database constructor
    const sqlite3Module = await import('sqlite3')
    const originalDatabase = sqlite3Module.default.Database
    sqlite3Module.default.Database = failingDatabase as any

    try {
      expect(initializeDatabase()).rejects.toThrow('Connection failed')
    } finally {
      sqlite3Module.default.Database = originalDatabase
    }
  })
})

describe('Migration Logic', () => {
  beforeEach(() => {
    mockRun.mockClear()
    mockExec.mockClear()
    mockGet.mockClear()
    mockAll.mockClear()
  })

  test('should identify which migrations need to be applied', async () => {
    // Mock that first migration is already applied
    mockAll.mockResolvedValue([
      { id: '0000_initial_schema' },
      { id: '20250108120000_add_raw_audio_to_interactions' },
    ])
    mockRun.mockResolvedValue(undefined)
    mockExec.mockResolvedValue(undefined)

    await initializeDatabase()

    // Should only run the remaining migration
    expect(mockExec).toHaveBeenCalledWith(
      'ALTER TABLE interactions ADD COLUMN duration_ms INTEGER DEFAULT 0;',
    )

    // Should record the new migration
    expect(mockRun).toHaveBeenCalledWith(
      'INSERT INTO migrations (id, applied_at) VALUES (?, ?)',
      ['20250108130000_add_duration_to_interactions', expect.any(String)],
    )
  })

  test('should skip all migrations when database is up to date', async () => {
    // Mock all migrations already applied
    mockAll.mockResolvedValue([
      { id: '0000_initial_schema' },
      { id: '20250108120000_add_raw_audio_to_interactions' },
      { id: '20250108130000_add_duration_to_interactions' },
    ])

    const consoleSpy = mock()
    const originalInfo = console.info
    console.info = consoleSpy

    try {
      await initializeDatabase()
      expect(consoleSpy).toHaveBeenCalledWith('Database schema is up to date.')
    } finally {
      console.info = originalInfo
    }
  })

  test('should handle migration failure with proper rollback', async () => {
    mockAll.mockResolvedValue([]) // No existing migrations

    // Setup exec to fail on schema execution
    let callCount = 0
    mockExec.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve(undefined) // BEGIN
      if (callCount === 2) return Promise.reject(new Error('Migration failed')) // Schema fails
      if (callCount === 3) return Promise.resolve(undefined) // ROLLBACK
      return Promise.resolve(undefined)
    })

    await expect(initializeDatabase()).rejects.toThrow(
      'Migration 0000_initial_schema failed.',
    )

    expect(mockExec).toHaveBeenCalledWith('ROLLBACK;')
  })
})

describe('Migration Validation', () => {
  beforeEach(() => {
    mockGet.mockClear()
    mockExec.mockClear()
    mockRun.mockClear()
  })

  test('should prevent reverting initial schema', async () => {
    mockGet.mockResolvedValue({ id: '0000_initial_schema' })

    expect(revertLastMigration()).rejects.toThrow(
      'Reverting the initial schema is not supported.',
    )
  })

  test('should handle migration not found in code', async () => {
    mockGet.mockResolvedValue({ id: 'unknown_migration_12345' })

    expect(revertLastMigration()).rejects.toThrow(
      'Migration with id unknown_migration_12345 found in DB but not in code.',
    )
  })

  test('should handle no migrations to revert', async () => {
    mockGet.mockResolvedValue(null)

    const consoleSpy = mock()
    const originalInfo = console.info
    console.info = consoleSpy

    try {
      await revertLastMigration()
      expect(consoleSpy).toHaveBeenCalledWith('No migrations to revert.')
    } finally {
      console.info = originalInfo
    }
  })

  test('should successfully revert valid migration', async () => {
    // Mock finding a valid migration to revert
    mockGet.mockResolvedValue({
      id: '20250108130000_add_duration_to_interactions',
    })
    mockExec.mockResolvedValue(undefined)
    mockRun.mockResolvedValue(undefined)

    await revertLastMigration()

    // Should execute the down script
    expect(mockExec).toHaveBeenCalledWith(
      'ALTER TABLE interactions DROP COLUMN duration_ms;',
    )

    // Should remove migration from database
    expect(mockRun).toHaveBeenCalledWith(
      'DELETE FROM migrations WHERE id = ?',
      ['20250108130000_add_duration_to_interactions'],
    )
  })

  test('should rollback on revert failure', async () => {
    mockGet.mockResolvedValue({
      id: '20250108130000_add_duration_to_interactions',
    })
    mockExec.mockResolvedValueOnce(undefined) // BEGIN
    mockExec.mockRejectedValueOnce(new Error('Revert failed')) // DOWN script fails
    mockExec.mockResolvedValueOnce(undefined) // ROLLBACK

    expect(revertLastMigration()).rejects.toThrow(
      'Migration 20250108130000_add_duration_to_interactions revert failed.',
    )

    expect(mockExec).toHaveBeenCalledWith('ROLLBACK;')
  })
})

describe('File Error Handling', () => {
  beforeEach(() => {
    // Clear all mocks
    mockRun.mockClear()
    mockExec.mockClear()
    mockGet.mockClear()
    mockAll.mockClear()
    mockFs.unlink.mockClear()
    mockSqliteDatabase.close.mockClear()
    mockSqliteDatabase.run.mockClear()
    mockSqliteDatabase.exec.mockClear()

    // Reset module state by clearing require cache
    delete require.cache[require.resolve('./db')]
  })

  /* Bun sucks and doesn't support mocked errors in tests */
  // test('should handle file not found gracefully during wipe', async () => {
  //   const fileNotFoundError = new Error('File not found')
  //   ;(fileNotFoundError as any).code = 'ENOENT'
  //   mockFs.unlink.mockRejectedValue(fileNotFoundError)

  //   const consoleSpy = mock()
  //   const originalInfo = console.info
  //   console.info = consoleSpy

  //   try {
  //     await wipeDatabase()
  //     expect(consoleSpy).toHaveBeenCalledWith(
  //       'Database file did not exist, skipping deletion.',
  //     )
  //   } finally {
  //     console.info = originalInfo
  //   }
  // })

  // test('should rethrow non-ENOENT file errors', async () => {
  //   const permissionError = new Error('Permission denied')
  //   ;(permissionError as any).code = 'EPERM'
  //   mockFs.unlink.mockRejectedValue(permissionError)

  //   expect(wipeDatabase()).rejects.toThrow('Permission denied')
  // })

  test('should successfully delete database file when it exists', async () => {
    mockFs.unlink.mockResolvedValue(undefined)

    await wipeDatabase()

    const expectedPath = path.join('/tmp/test-ito-app', 'ito.db')
    expect(mockFs.unlink).toHaveBeenCalledWith(expectedPath)
  })
})

describe('Timestamp Generation', () => {
  test('should generate valid ISO timestamps for migrations', async () => {
    mockAll.mockResolvedValue([])
    mockRun.mockResolvedValue(undefined)
    mockExec.mockResolvedValue(undefined)

    const beforeTime = Date.now()
    await initializeDatabase()
    const afterTime = Date.now()

    // Verify migration timestamp is valid and within reasonable range
    const migrationCall = mockRun.mock.calls.find(call =>
      call[0].includes('INSERT INTO migrations'),
    )
    expect(migrationCall).toBeDefined()

    if (!migrationCall) {
      // Fail the test
      expect(1).toBe(2)
      return
    }

    const timestamp = migrationCall[1][1] // second parameter is timestamp
    const timestampTime = new Date(timestamp).getTime()

    expect(() => new Date(timestamp)).not.toThrow()
    expect(timestampTime).toBeGreaterThanOrEqual(beforeTime)
    expect(timestampTime).toBeLessThanOrEqual(afterTime)
  })
})
