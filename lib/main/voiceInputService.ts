import { audioRecorderService } from '../media/audio'
import { muteSystemAudio, unmuteSystemAudio } from '../media/systemAudio'
import { getPillWindow, mainWindow } from './app'
import store from './store'
import { STORE_KEYS } from '../constants/store-keys'
import { transcriptionService } from './transcriptionService'
import { ItoMode } from '@/app/generated/ito_pb'
import { IPC_EVENTS, RecordingStatePayload } from '../types/ipc'

export class VoiceInputService {
  public startSTTService = async (mode: ItoMode) => {
    console.info(
      '[Audio] Starting STT service with mode:',
      mode,
      mode === ItoMode.EDIT ? 'EDIT' : 'TRANSCRIBE',
    )
    const deviceId = store.get(STORE_KEYS.SETTINGS).microphoneDeviceId

    const settings = store.get(STORE_KEYS.SETTINGS)
    if (settings && settings.muteAudioWhenDictating) {
      console.info('[Audio] Muting system audio for dictation')
      muteSystemAudio()
    }

    const started = await transcriptionService.startTranscription(mode)
    if (!started) {
      console.warn(
        '[Audio] Transcription did not start, skipping recorder start',
      )
      return
    }
    audioRecorderService.startRecording(deviceId)

    const recordingStatePayload: RecordingStatePayload = {
      isRecording: true,
      deviceId,
      mode,
    }
    getPillWindow()?.webContents.send(
      IPC_EVENTS.RECORDING_STATE_UPDATE,
      recordingStatePayload,
    )
  }

  public stopSTTService = async () => {
    audioRecorderService.stopRecording()

    // Wait for explicit drain-complete signal from the recorder (with timeout fallback)
    try {
      await (audioRecorderService as any).awaitDrainComplete?.(500)
    } catch (e) {
      console.warn('[Audio] drain-complete wait failed, proceeding:', e)
    }

    transcriptionService.stopTranscription()

    if (store.get(STORE_KEYS.SETTINGS).muteAudioWhenDictating) {
      console.info('[Audio] Unmuting system audio after dictation')
      unmuteSystemAudio()
    }

    const recordingStatePayload: RecordingStatePayload = {
      isRecording: false,
      deviceId: '',
    }
    getPillWindow()?.webContents.send(
      IPC_EVENTS.RECORDING_STATE_UPDATE,
      recordingStatePayload,
    )
  }

  public setUpAudioRecorderListeners = () => {
    audioRecorderService.on(
      'audio-config',
      ({ outputSampleRate, sampleRate }: any) => {
        // Use the recorder's effective output rate (matches the PCM we store)
        const effectiveRate = outputSampleRate || sampleRate || 16000
        transcriptionService.setAudioConfig({ sampleRate: effectiveRate })
      },
    )
    audioRecorderService.on('audio-chunk', chunk => {
      transcriptionService.handleAudioChunk(chunk)
    })

    audioRecorderService.on('volume-update', volume => {
      getPillWindow()?.webContents.send(IPC_EVENTS.VOLUME_UPDATE, volume)
      if (
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.webContents.isDestroyed()
      ) {
        mainWindow.webContents.send(IPC_EVENTS.VOLUME_UPDATE, volume)
      }
    })

    audioRecorderService.on('error', err => {
      // Handle errors, maybe show a dialog to the user
      console.error('Audio Service Error:', err.message)
    })

    audioRecorderService.initialize()
  }

  /**
   * Call this when microphone selection changes to update the transcription
   * config with the effective output sample rate for the chosen device.
   */
  public handleMicrophoneChanged = (deviceId: string) => {
    audioRecorderService.requestDeviceConfig(deviceId)
  }
}

export const voiceInputService = new VoiceInputService()
