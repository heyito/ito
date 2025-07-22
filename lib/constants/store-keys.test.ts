import { describe, test, expect } from 'bun:test'
import { STORE_KEYS } from './store-keys'

describe('STORE_KEYS', () => {
  test('should contain all expected keys', () => {
    expect(STORE_KEYS.AUTH).toBe('auth')
    expect(STORE_KEYS.USER_PROFILE).toBe('userProfile')
    expect(STORE_KEYS.ID_TOKEN).toBe('idToken')
    expect(STORE_KEYS.ACCESS_TOKEN).toBe('accessToken')
    expect(STORE_KEYS.MAIN).toBe('main')
    expect(STORE_KEYS.ONBOARDING).toBe('onboarding')
    expect(STORE_KEYS.SETTINGS).toBe('settings')
    expect(STORE_KEYS.OPEN_MIC).toBe('openMic')
    expect(STORE_KEYS.SELECTED_AUDIO_INPUT).toBe('selectedAudioInput')
    expect(STORE_KEYS.INTERACTION_SOUNDS).toBe('interactionSounds')
  })
})
