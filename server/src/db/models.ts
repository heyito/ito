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
  raw_audio_id: string | null
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

interface LlmSettingsBase {
  asr_model: string | null
  asr_provider: string | null
  asr_prompt: string | null
  llm_provider: string | null
  llm_model: string | null
  llm_temperature: number | null
  transcription_prompt: string | null
  editing_prompt: string | null
  no_speech_threshold: number | null
  low_quality_threshold: number | null
}

export interface LlmSettings extends LlmSettingsBase {
  id: string
  created_at: Date
  updated_at: Date
  user_id: string
}

export interface AdvancedSettings {
  id: string
  user_id: string
  llm: LlmSettingsBase
  created_at: Date
  updated_at: Date
}

export interface UserTrial {
  user_id: string
  trial_start_at: Date | null
  trial_end_at: Date | null
  has_completed_trial: boolean
  stripe_subscription_id: string | null
  created_at: Date
  updated_at: Date
}

export interface UserSubscription {
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_start_at: Date | null
  subscription_end_at: Date | null
  created_at: Date
  updated_at: Date
}
