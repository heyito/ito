import { ItoMode } from '@/app/generated/ito_pb'
import { getPillWindow, mainWindow } from './app'
import { IPC_EVENTS, RecordingStatePayload } from '../types/ipc'
import log from 'electron-log'

/**
 * Helper class to notify UI windows about recording state changes.
 */
export class RecordingStateNotifier {
  public notifyRecordingStarted(mode: ItoMode) {
    log.info('[RecordingStateNotifier] Notifying recording started:', { mode })

    const payload: RecordingStatePayload = {
      isRecording: true,
      mode,
    }

    this.sendToWindows(payload)
  }

  public notifyRecordingStopped() {
    log.info('[RecordingStateNotifier] Notifying recording stopped')

    const payload: RecordingStatePayload = {
      isRecording: false,
    }

    this.sendToWindows(payload)
  }

  private sendToWindows(payload: RecordingStatePayload) {
    // Send to pill window
    getPillWindow()?.webContents.send(
      IPC_EVENTS.RECORDING_STATE_UPDATE,
      payload,
    )

    // Send to main window if it exists and is not destroyed
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send(IPC_EVENTS.RECORDING_STATE_UPDATE, payload)
    }
  }
}

export const recordingStateNotifier = new RecordingStateNotifier()
