import { mock } from 'bun:test'

// Mock SQLite database
export const mockSqliteDatabase = mock(() => {
  const db = new Map<string, any[]>()

  return {
    run: mock(
      (
        _query: string,
        _params: any[] = [],
        callback?: (err: Error | null) => void,
      ) => {
        // Simulate successful execution
        if (callback) callback(null)
      },
    ),

    get: mock(
      (
        query: string,
        params: any[] = [],
        callback?: (err: Error | null, row?: any) => void,
      ) => {
        // Return mock data based on query
        const mockRow = getMockRowForQuery(query, params)
        if (callback) callback(null, mockRow)
      },
    ),

    all: mock(
      (
        query: string,
        params: any[] = [],
        callback?: (err: Error | null, rows?: any[]) => void,
      ) => {
        // Return mock data based on query
        const mockRows = getMockRowsForQuery(query, params)
        if (callback) callback(null, mockRows)
      },
    ),

    exec: mock((_query: string, callback?: (err: Error | null) => void) => {
      // Simulate successful execution
      if (callback) callback(null)
    }),

    close: mock((callback?: (err: Error | null) => void) => {
      if (callback) callback(null)
    }),

    // Internal storage for testing
    _testData: db,
    _addTestData: (table: string, rows: any[]) => db.set(table, rows),
    _clearTestData: () => db.clear(),
  }
})

// Helper to generate mock rows based on query patterns
const getMockRowForQuery = (query: string, _params: any[] = []) => {
  if (query.includes('SELECT * FROM migrations')) {
    return { id: '0000_initial_schema', applied_at: '2024-01-01T00:00:00.000Z' }
  }

  if (query.includes('SELECT * FROM interactions')) {
    return {
      id: 'test-interaction-id',
      user_id: 'test-user-id',
      title: 'Test Interaction',
      asr_output: '{"transcript": "hello world"}',
      llm_output: '{"response": "Hello!"}',
      raw_audio: null,
      duration_ms: 1000,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      deleted_at: null,
    }
  }

  if (query.includes('SELECT * FROM notes')) {
    return {
      id: 'test-note-id',
      user_id: 'test-user-id',
      interaction_id: 'test-interaction-id',
      content: 'Test note content',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      deleted_at: null,
    }
  }

  if (query.includes('SELECT * FROM dictionary_items')) {
    return {
      id: 'test-dict-id',
      user_id: 'test-user-id',
      word: 'test',
      pronunciation: 'test',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      deleted_at: null,
    }
  }

  if (query.includes('SELECT value FROM key_value_store')) {
    return { value: 'test-value' }
  }

  return null
}

const getMockRowsForQuery = (query: string, params: any[] = []) => {
  const singleRow = getMockRowForQuery(query, params)
  return singleRow ? [singleRow] : []
}

// Reset function
export const resetSqliteMocks = () => {
  mockSqliteDatabase.mockClear()
}
