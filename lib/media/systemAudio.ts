import { execSync } from 'child_process'
import log from 'electron-log'
import os from 'os'

let previousVolume: number | null = null

/**
 * Gets the current system volume (0-100)
 */
export function getSystemVolume(): number | null {
  if (os.platform() !== 'darwin') {
    log.warn('System audio control is only supported on macOS')
    return null
  }

  try {
    const result = execSync(
      'osascript -e "get volume settings" | grep -o "output volume:[0-9]*" | grep -o "[0-9]*"',
      { encoding: 'utf8' },
    )
    return parseInt(result.trim(), 10)
  } catch (error) {
    log.error('Failed to get system volume:', error)
    return null
  }
}

/**
 * Sets the system volume (0-100)
 */
export function setSystemVolume(volume: number): boolean {
  if (os.platform() !== 'darwin') {
    log.warn('System audio control is only supported on macOS')
    return false
  }

  try {
    execSync(
      `osascript -e "set volume output volume ${Math.max(0, Math.min(100, volume))}"`,
    )
    return true
  } catch (error) {
    log.error('Failed to set system volume:', error)
    return false
  }
}

/**
 * Mutes system audio and stores the previous volume
 */
export function muteSystemAudio(): boolean {
  if (os.platform() !== 'darwin') {
    log.warn('System audio control is only supported on macOS')
    return false
  }

  try {
    // Store current volume before muting
    previousVolume = getSystemVolume()
    if (previousVolume !== null) {
      console.log(`Muting system audio. Previous volume: ${previousVolume}`)
      return setSystemVolume(0)
    }
    return false
  } catch (error) {
    log.error('Failed to mute system audio:', error)
    return false
  }
}

/**
 * Unmutes system audio and restores the previous volume
 */
export function unmuteSystemAudio(): boolean {
  if (os.platform() !== 'darwin') {
    log.warn('System audio control is only supported on macOS')
    return false
  }

  try {
    if (previousVolume !== null) {
      console.log(`Unmuting system audio. Restoring volume: ${previousVolume}`)
      const success = setSystemVolume(previousVolume)
      previousVolume = null // Clear stored volume
      return success
    } else {
      log.warn('No previous volume stored, cannot unmute')
      return false
    }
  } catch (error) {
    log.error('Failed to unmute system audio:', error)
    return false
  }
}
