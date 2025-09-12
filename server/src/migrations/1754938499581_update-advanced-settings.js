/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = pgm => {
  // Add new columns to llm_settings table
  pgm.addColumns('llm_settings', {
    asr_provider: {
      type: 'text',
      default: 'groq',
    },
    asr_prompt: {
      type: 'text',
      default: '',
    },
    llm_provider: {
      type: 'text',
      default: 'groq',
    },
    llm_model: {
      type: 'text',
      default: 'openai/gpt-oss-120b',
    },
    llm_temperature: {
      type: 'decimal',
      default: 0.1,
    },
    transcription_prompt: {
      type: 'text',
      default: '',
    },
    editing_prompt: {
      type: 'text',
      default: '',
    },
    no_speech_threshold: {
      type: 'decimal',
      default: 0.35,
    },
    low_quality_threshold: {
      type: 'decimal',
      default: -0.55,
    },
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = pgm => {
  // Remove columns from llm_settings table
  pgm.dropColumns('llm_settings', [
    'asr_provider',
    'asr_prompt',
    'llm_provider',
    'llm_model',
    'llm_temperature',
    'transcription_prompt',
    'editing_prompt',
    'no_speech_threshold',
    'low_quality_threshold',
  ])
}
