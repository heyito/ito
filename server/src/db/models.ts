export interface Note {
  id: string
  user_id: string
  interaction_id: string | null
  content: string
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface Interaction {
  id: string
  user_id: string | null
  title: string | null
  asr_output: any
  llm_output: any
  raw_audio: Buffer | null
  duration_ms: number | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface DictionaryItem {
  id: string
  user_id: string
  word: string
  pronunciation: string | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}
