/**
 * Shared constants for default advanced settings across the Ito monorepo.
 * This file is used by both the Electron app and the server to ensure consistency.
 */

const DEFAULT_ADVANCED_SETTINGS = {
  // ASR (Automatic Speech Recognition) settings
  asrProvider: 'groq',
  asrModel: 'whisper-large-v3', 
  asrPrompt: '',
  
  // LLM (Large Language Model) settings
  llmProvider: 'groq',
  llmModel: 'openai/gpt-oss-120b',
  llmTemperature: 0.1,
  
  // Prompt settings
  transcriptionPrompt: '',
  editingPrompt: '',
  
  // Audio quality thresholds
  noSpeechThreshold: 0.35,
  lowQualityThreshold: -0.55,
}

module.exports = { DEFAULT_ADVANCED_SETTINGS }