export interface Interaction {
  id: string
  user_id: string | null
  title: string | null
  asr_output: any
  llm_output: any
  raw_audio: Buffer | null
  raw_audio_id: string | null
  duration_ms: number | null
  sample_rate: number | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Note {
  id: string
  user_id: string
  interaction_id: string | null
  content: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface DictionaryItem {
  id: string
  user_id: string
  word: string
  pronunciation: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export enum ProStatus {
  FREE = 'FREE',
  PRO_TRIAL = 'PRO_TRIAL',
  PRO = 'PRO',
}

export interface UserMetadata {
  id: string
  user_id: string
  pro_status: ProStatus
  free_words_remaining: number | null
  pro_trial_start_date: string | null
  pro_subscription_start_date: string | null
  pro_subscription_end_date: string | null
  created_at: string
  updated_at: string
}
