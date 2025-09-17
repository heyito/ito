import { BrowserWindow } from 'electron'

export class WindowMessenger {
  private mainWindow: BrowserWindow | null = null

  setMainWindow(mainWindow: BrowserWindow | null) {
    this.mainWindow = mainWindow
  }

  sendTranscriptionResult(response: any) {
    if (this.canSendMessage()) {
      try {
        this.mainWindow!.webContents.send('transcription-result', response)
      } catch (error) {
        console.error(
          'Error sending transcription result to main window:',
          error,
        )
      }
    }
  }

  sendTranscriptionError(error: any) {
    if (this.canSendMessage()) {
      try {
        this.mainWindow!.webContents.send('transcription-error', error)
      } catch (windowError) {
        console.error(
          'Error sending transcription error to main window:',
          windowError,
        )
      }
    }
  }

  private canSendMessage(): boolean {
    return !!(
      this.mainWindow &&
      !this.mainWindow.isDestroyed() &&
      this.mainWindow.webContents &&
      !this.mainWindow.webContents.isDestroyed()
    )
  }
}
