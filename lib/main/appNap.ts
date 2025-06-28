import { powerSaveBlocker } from 'electron'

let powerSaveBlockerId: number | null = null

// Prevent the system from going to sleep
export function preventAppNap() {
  if (powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')
  }
}

// Allow the system to sleep again
export function allowAppNap() {
  if (powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId)
    powerSaveBlockerId = null
  }
}
