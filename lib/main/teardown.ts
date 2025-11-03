import { exec } from 'child_process'
import { audioRecorderService } from '../media/audio'
import { stopKeyListener } from '../media/keyboard'
import { selectedTextReaderService } from '../media/selected-text-reader'
import { allowAppNap } from './appNap'
import { syncService } from './syncService'
import { destroyAppTray } from './tray'
import { timingCollector } from './timing/TimingCollector'

export const teardown = () => {
  stopKeyListener()
  audioRecorderService.terminate()
  selectedTextReaderService.terminate()
  timingCollector.shutdown()
  syncService.stop()
  destroyAppTray()
  allowAppNap()
}

const WIN_HELPERS = [
  'global-key-listener.exe',
  'audio-recorder.exe',
  'text-writer.exe',
  'active-application.exe',
  'selected-text-reader.exe',
  'electron-crashpad-handler.exe',
]

const MAC_HELPERS = [
  'global-key-listener',
  'audio-recorder',
  'text-writer',
  'active-application',
  'selected-text-reader',
  'electron-crashpad-handler',
  // Electron’s helpers (your app name may differ)
  'Ito Helper',
  'Ito Helper (Renderer)',
  'Ito Helper (GPU)',
  'Ito Helper (Plugin)',
]

export function killByName(name: string): Promise<void> {
  return new Promise(resolve => {
    const cmd =
      process.platform === 'win32'
        ? `taskkill /IM "${name}" /T /F`
        : `pkill -f "${name}" || true`
    exec(cmd, () => resolve())
  })
}

export async function hardKillAll(): Promise<void> {
  const names = process.platform === 'win32' ? WIN_HELPERS : MAC_HELPERS
  for (const n of names) {
    try {
      await killByName(n)
    } catch {
      /* empty */
    }
  }
  // tiny grace window for handle release
  await new Promise(r => setTimeout(r, 500))
}
