import type {
  Interaction,
  Note,
  DictionaryItem,
} from '../../main/sqlite/models'

// Test user IDs
export const TEST_USER_ID = 'test-user-123'
export const TEST_USER_ID_2 = 'test-user-456'

// Sample interaction data
export const sampleInteraction: Interaction = {
  id: 'interaction-1',
  user_id: TEST_USER_ID,
  title: 'Sample Interaction',
  asr_output: {
    transcript: 'Hello world',
    words: [
      { text: 'Hello', start: 0, end: 1 },
      { text: 'world', start: 1, end: 2 },
    ],
  },
  llm_output: {
    response: 'Hello to you too!',
    confidence: 0.95,
  },
  raw_audio: Buffer.from('fake-audio-data'),
  duration_ms: 2000,
  created_at: '2024-01-01T10:00:00.000Z',
  updated_at: '2024-01-01T10:00:00.000Z',
  deleted_at: null,
}

export const sampleInteractionNoUser: Interaction = {
  id: 'interaction-2',
  user_id: null,
  title: 'Anonymous Interaction',
  asr_output: {
    transcript: 'Anonymous test',
  },
  llm_output: {
    response: 'Anonymous response',
  },
  raw_audio: null,
  duration_ms: 1500,
  created_at: '2024-01-01T11:00:00.000Z',
  updated_at: '2024-01-01T11:00:00.000Z',
  deleted_at: null,
}

export const sampleDeletedInteraction: Interaction = {
  id: 'interaction-3',
  user_id: TEST_USER_ID,
  title: 'Deleted Interaction',
  asr_output: { transcript: 'Deleted content' },
  llm_output: { response: 'Deleted response' },
  raw_audio: null,
  duration_ms: 1000,
  created_at: '2024-01-01T09:00:00.000Z',
  updated_at: '2024-01-01T12:00:00.000Z',
  deleted_at: '2024-01-01T12:00:00.000Z',
}

// Sample note data
export const sampleNote: Note = {
  id: 'note-1',
  user_id: TEST_USER_ID,
  interaction_id: 'interaction-1',
  content: 'This is a sample note content',
  created_at: '2024-01-01T10:00:00.000Z',
  updated_at: '2024-01-01T10:00:00.000Z',
  deleted_at: null,
}

export const sampleNoteNoInteraction: Note = {
  id: 'note-2',
  user_id: TEST_USER_ID,
  interaction_id: null,
  content: 'Standalone note without interaction',
  created_at: '2024-01-01T11:00:00.000Z',
  updated_at: '2024-01-01T11:00:00.000Z',
  deleted_at: null,
}

export const sampleDeletedNote: Note = {
  id: 'note-3',
  user_id: TEST_USER_ID,
  interaction_id: 'interaction-1',
  content: 'Deleted note content',
  created_at: '2024-01-01T09:00:00.000Z',
  updated_at: '2024-01-01T12:00:00.000Z',
  deleted_at: '2024-01-01T12:00:00.000Z',
}

// Sample dictionary data
export const sampleDictionaryItem: DictionaryItem = {
  id: 'dict-1',
  user_id: TEST_USER_ID,
  word: 'pronunciation',
  pronunciation: 'pruh-nuhn-see-AY-shuhn',
  created_at: '2024-01-01T10:00:00.000Z',
  updated_at: '2024-01-01T10:00:00.000Z',
  deleted_at: null,
}

export const sampleDictionaryItemNoPronunciation: DictionaryItem = {
  id: 'dict-2',
  user_id: TEST_USER_ID,
  word: 'simple',
  pronunciation: null,
  created_at: '2024-01-01T11:00:00.000Z',
  updated_at: '2024-01-01T11:00:00.000Z',
  deleted_at: null,
}

export const sampleDeletedDictionaryItem: DictionaryItem = {
  id: 'dict-3',
  user_id: TEST_USER_ID,
  word: 'deleted',
  pronunciation: 'dih-LEET-ed',
  created_at: '2024-01-01T09:00:00.000Z',
  updated_at: '2024-01-01T12:00:00.000Z',
  deleted_at: '2024-01-01T12:00:00.000Z',
}

// Collections for easy testing
export const allSampleInteractions = [
  sampleInteraction,
  sampleInteractionNoUser,
  sampleDeletedInteraction,
]

export const allSampleNotes = [
  sampleNote,
  sampleNoteNoInteraction,
  sampleDeletedNote,
]

export const allSampleDictionaryItems = [
  sampleDictionaryItem,
  sampleDictionaryItemNoPronunciation,
  sampleDeletedDictionaryItem,
]

// Helper functions for creating variations
export const createInteractionForUser = (
  userId: string,
  overrides: Partial<Interaction> = {},
): Interaction => ({
  ...sampleInteraction,
  id: `interaction-${Date.now()}-${Math.random()}`,
  user_id: userId,
  ...overrides,
})

export const createNoteForUser = (
  userId: string,
  overrides: Partial<Note> = {},
): Note => ({
  ...sampleNote,
  id: `note-${Date.now()}-${Math.random()}`,
  user_id: userId,
  ...overrides,
})

export const createDictionaryItemForUser = (
  userId: string,
  overrides: Partial<DictionaryItem> = {},
): DictionaryItem => ({
  ...sampleDictionaryItem,
  id: `dict-${Date.now()}-${Math.random()}`,
  user_id: userId,
  ...overrides,
})

// Migration test data
export const sampleMigrations = [
  {
    id: '0000_initial_schema',
    applied_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: '20250108120000_add_raw_audio_to_interactions',
    applied_at: '2024-01-08T12:00:00.000Z',
  },
  {
    id: '20250108130000_add_duration_to_interactions',
    applied_at: '2024-01-08T13:00:00.000Z',
  },
]
