/**
 * Make all LLM settings columns nullable to support "use defaults" pattern.
 * This allows NULL values to indicate "use system default" rather than forcing
 * empty strings or zeros.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = pgm => {
  // Remove DEFAULT constraints and make columns nullable
  // This allows NULL to mean "use system defaults" instead of forcing empty values

  pgm.alterColumn('llm_settings', 'asr_model', {
    default: null,
    notNull: false,
  })

  pgm.alterColumn('llm_settings', 'asr_provider', {
    default: null,
    notNull: false,
  })

  pgm.alterColumn('llm_settings', 'asr_prompt', {
    default: null,
    notNull: false,
  })

  pgm.alterColumn('llm_settings', 'llm_provider', {
    default: null,
    notNull: false,
  })

  pgm.alterColumn('llm_settings', 'llm_model', {
    default: null,
    notNull: false,
  })

  pgm.alterColumn('llm_settings', 'llm_temperature', {
    default: null,
    notNull: false,
  })

  pgm.alterColumn('llm_settings', 'transcription_prompt', {
    default: null,
    notNull: false,
  })

  pgm.alterColumn('llm_settings', 'editing_prompt', {
    default: null,
    notNull: false,
  })

  pgm.alterColumn('llm_settings', 'no_speech_threshold', {
    default: null,
    notNull: false,
  })

  pgm.alterColumn('llm_settings', 'low_quality_threshold', {
    default: null,
    notNull: false,
  })

  // This makes existing data consistent with the new pattern
  // Users who had defaults will now explicitly see they're using defaults
  // Also update updated_at so the sync service knows the data changed
  pgm.sql(`
    UPDATE llm_settings
    SET
      asr_model = CASE WHEN asr_model = 'whisper-large-v3' THEN NULL ELSE asr_model END,
      asr_provider = CASE WHEN asr_provider = 'groq' THEN NULL ELSE asr_provider END,
      asr_prompt = CASE WHEN asr_prompt = '' THEN NULL ELSE asr_prompt END,
      llm_provider = CASE WHEN llm_provider = 'groq' THEN NULL ELSE llm_provider END,
      llm_model = CASE WHEN llm_model = 'openai/gpt-oss-120b' THEN NULL ELSE llm_model END,
      llm_temperature = CASE WHEN llm_temperature = 0.1 THEN NULL ELSE llm_temperature END,
      transcription_prompt = CASE WHEN transcription_prompt = '' THEN NULL ELSE transcription_prompt END,
      editing_prompt = CASE WHEN editing_prompt = '' THEN NULL ELSE editing_prompt END,
      no_speech_threshold = CASE WHEN no_speech_threshold = 0.35 THEN NULL ELSE no_speech_threshold END,
      low_quality_threshold = CASE WHEN low_quality_threshold = -0.55 THEN NULL ELSE low_quality_threshold END,
      updated_at = CURRENT_TIMESTAMP
  `)
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = pgm => {
  // Restore the original defaults
  // Convert NULL back to the original default values
  pgm.sql(`
    UPDATE llm_settings
    SET
      asr_model = COALESCE(asr_model, 'whisper-large-v3'),
      asr_provider = COALESCE(asr_provider, 'groq'),
      asr_prompt = COALESCE(asr_prompt, ''),
      llm_provider = COALESCE(llm_provider, 'groq'),
      llm_model = COALESCE(llm_model, 'openai/gpt-oss-120b'),
      llm_temperature = COALESCE(llm_temperature, 0.1),
      transcription_prompt = COALESCE(transcription_prompt, ''),
      editing_prompt = COALESCE(editing_prompt, ''),
      no_speech_threshold = COALESCE(no_speech_threshold, 0.35),
      low_quality_threshold = COALESCE(low_quality_threshold, -0.55)
  `)

  // Restore NOT NULL constraints and defaults
  pgm.alterColumn('llm_settings', 'asr_model', {
    default: 'whisper-large-v3',
    notNull: true,
  })

  pgm.alterColumn('llm_settings', 'asr_provider', {
    default: 'groq',
    notNull: true,
  })

  pgm.alterColumn('llm_settings', 'asr_prompt', {
    default: '',
    notNull: true,
  })

  pgm.alterColumn('llm_settings', 'llm_provider', {
    default: 'groq',
    notNull: true,
  })

  pgm.alterColumn('llm_settings', 'llm_model', {
    default: 'openai/gpt-oss-120b',
    notNull: true,
  })

  pgm.alterColumn('llm_settings', 'llm_temperature', {
    default: 0.1,
    notNull: true,
  })

  pgm.alterColumn('llm_settings', 'transcription_prompt', {
    default: '',
    notNull: true,
  })

  pgm.alterColumn('llm_settings', 'editing_prompt', {
    default: '',
    notNull: true,
  })

  pgm.alterColumn('llm_settings', 'no_speech_threshold', {
    default: 0.35,
    notNull: true,
  })

  pgm.alterColumn('llm_settings', 'low_quality_threshold', {
    default: -0.55,
    notNull: true,
  })
}
