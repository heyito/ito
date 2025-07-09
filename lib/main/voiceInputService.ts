import { audioRecorderService } from '../media/audio'
import { muteSystemAudio, unmuteSystemAudio } from '../media/systemAudio'
import { getPillWindow, mainWindow } from './app'
import store from './store'
import { transcriptionService } from './transcriptionService'

export class VoiceInputService {
  public startSTTService = (sendToServer: boolean = true) => {
    console.info('[Audio] Starting STT service')
    const deviceId = store.get('settings').microphoneDeviceId

    const settings = store.get('settings')
    if (settings && settings.muteAudioWhenDictating) {
      console.info('[Audio] Muting system audio for dictation')
      muteSystemAudio()
    }

    if (sendToServer) {
      transcriptionService.startTranscription()
    }
    audioRecorderService.startRecording(deviceId)

    getPillWindow()?.webContents.send('recording-state-update', {
      isRecording: true,
      deviceId,
    })
  }

  public stopSTTService = () => {
    audioRecorderService.stopRecording()

    transcriptionService.stopTranscription()

    if (store.get('settings').muteAudioWhenDictating) {
      console.info('[Audio] Unmuting system audio after dictation')
      unmuteSystemAudio()
    }

    getPillWindow()?.webContents.send('recording-state-update', {
      isRecording: false,
      deviceId: '',
    })
  }

  public setUpAudioRecorderListeners = () => {
    audioRecorderService.on('audio-chunk', chunk => {
      transcriptionService.handleAudioChunk(chunk)
    })

    audioRecorderService.on('volume-update', volume => {
      getPillWindow()?.webContents.send('volume-update', volume)
      mainWindow?.webContents.send('volume-update', volume)
    })

    audioRecorderService.on('error', err => {
      // Handle errors, maybe show a dialog to the user
      console.error('Audio Service Error:', err.message)
    })

    audioRecorderService.initialize()
  }
}

export const voiceInputService = new VoiceInputService()
