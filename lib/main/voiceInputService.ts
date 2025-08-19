import { audioRecorderService } from '../media/audio'
import { muteSystemAudio, unmuteSystemAudio } from '../media/systemAudio'
import { getPillWindow, mainWindow } from './app'
import store from './store'
import { STORE_KEYS } from '../constants/store-keys'
import { transcriptionService } from './transcriptionService'
import { traceLogger } from './traceLogger'
import { ItoMode } from '@/app/generated/ito_pb'

export class VoiceInputService {
  public startSTTService = (mode: ItoMode) => {
    console.info('[Audio] Starting STT service')
    const deviceId = store.get(STORE_KEYS.SETTINGS).microphoneDeviceId

    const settings = store.get(STORE_KEYS.SETTINGS)
    if (settings && settings.muteAudioWhenDictating) {
      console.info('[Audio] Muting system audio for dictation')
      muteSystemAudio()
    }

    // Get current interaction ID for trace logging
    const interactionId = (globalThis as any).currentInteractionId
    if (interactionId) {
      traceLogger.logStep(interactionId, 'VOICE_INPUT_START', {
        deviceId,
        muteAudioWhenDictating: settings?.muteAudioWhenDictating,
      })
    }

    transcriptionService.startTranscription(mode)
    audioRecorderService.startRecording(deviceId)

    getPillWindow()?.webContents.send('recording-state-update', {
      isRecording: true,
      deviceId,
    })
  }

  public stopSTTService = () => {
    // Get current interaction ID for trace logging
    const interactionId = (globalThis as any).currentInteractionId
    if (interactionId) {
      traceLogger.logStep(interactionId, 'VOICE_INPUT_STOP', {
        muteAudioWhenDictating: store.get(STORE_KEYS.SETTINGS)
          .muteAudioWhenDictating,
      })
    }

    audioRecorderService.stopRecording()

    transcriptionService.stopTranscription()

    if (store.get(STORE_KEYS.SETTINGS).muteAudioWhenDictating) {
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
      if (
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.webContents.isDestroyed()
      ) {
        mainWindow.webContents.send('volume-update', volume)
      }
    })

    audioRecorderService.on('error', err => {
      // Handle errors, maybe show a dialog to the user
      console.error('Audio Service Error:', err.message)
    })

    audioRecorderService.initialize()
  }
}

export const voiceInputService = new VoiceInputService()
