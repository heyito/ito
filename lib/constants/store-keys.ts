// Store key constants to avoid magic strings
// This file can be imported by both main and renderer processes
export const STORE_KEYS = {
  AUTH: 'auth',
  USER_PROFILE: 'userProfile',
  ID_TOKEN: 'idToken',
  ACCESS_TOKEN: 'accessToken',
  MAIN: 'main',
  ONBOARDING: 'onboarding',
  SETTINGS: 'settings',
  ADVANCED_SETTINGS: 'advancedSettings',
  OPEN_MIC: 'openMic',
  SELECTED_AUDIO_INPUT: 'selectedAudioInput',
  INTERACTION_SOUNDS: 'interactionSounds',
} as const

export type StoreKey = (typeof STORE_KEYS)[keyof typeof STORE_KEYS]
