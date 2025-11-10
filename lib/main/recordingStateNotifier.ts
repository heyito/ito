import { ItoMode } from '@/app/generated/ito_pb'
import { getPillWindow, mainWindow } from './app'
import {
  IPC_EVENTS,
  RecordingStatePayload,
  ProcessingStatePayload,
} from '../types/ipc'

/**
 * Helper class to notify UI windows about recording state changes.
 */
export class RecordingStateNotifier {
  public notifyRecordingStarted(mode: ItoMode) {
    console.log('[RecordingStateNotifier] Notifying recording started:', {
      mode,
    })
    this.sendToWindows(IPC_EVENTS.RECORDING_STATE_UPDATE, {
      isRecording: true,
      mode,
    })
  }

  public notifyRecordingStopped() {
    console.log('[RecordingStateNotifier] Notifying recording stopped')
    this.sendToWindows(IPC_EVENTS.RECORDING_STATE_UPDATE, {
      isRecording: false,
    })
  }

  public notifyProcessingStarted() {
    console.log('[RecordingStateNotifier] Notifying processing started')
    this.sendToWindows(IPC_EVENTS.PROCESSING_STATE_UPDATE, {
      isProcessing: true,
    })
  }

  public notifyProcessingStopped() {
    console.log('[RecordingStateNotifier] Notifying processing stopped')
    this.sendToWindows(IPC_EVENTS.PROCESSING_STATE_UPDATE, {
      isProcessing: false,
    })
  }

  private sendToWindows(
    event: string,
    payload: RecordingStatePayload | ProcessingStatePayload,
  ) {
    // Send to pill window
    getPillWindow()?.webContents.send(event, payload)

    // Send to main window if it exists and is not destroyed
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send(event, payload)
    }
  }
}

export const recordingStateNotifier = new RecordingStateNotifier()
