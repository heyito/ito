import { audioRecorderService } from '../media/audio'
import { stopKeyListener } from '../media/keyboard'
import { selectedTextReaderService } from '../media/selected-text-reader'
import { allowAppNap } from './appNap'
import { syncService } from './syncService'
import { destroyAppTray } from './tray'

export const teardown = () => {
  stopKeyListener()
  audioRecorderService.terminate()
  selectedTextReaderService.terminate()
  syncService.stop()
  destroyAppTray()
  allowAppNap()
}
