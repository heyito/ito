export const INITIAL_SCHEMA = `
  CREATE TABLE interactions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    asr_output TEXT,
    llm_output TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    interaction_id TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (interaction_id) REFERENCES interactions (id) ON DELETE SET NULL
  );

  CREATE TABLE dictionary_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    word TEXT NOT NULL,
    pronunciation TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE key_value_store (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`
