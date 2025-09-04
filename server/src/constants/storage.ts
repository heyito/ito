export const AUDIO_KEY_PREFIX = 'raw-audio'

export function createAudioKey(userId: string, audioUuid: string): string {
  return `${AUDIO_KEY_PREFIX}/${userId}/${audioUuid}`
}
