import { audioRecorderService } from '../media/audio'
import { muteSystemAudio, unmuteSystemAudio } from '../media/systemAudio'
import { getPillWindow, mainWindow } from './app'
import store from './store'
import { STORE_KEYS } from '../constants/store-keys'
import { itoController } from './itoController'
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
    console.info('[Audio] Using microphone device:', deviceId)

    const settings = store.get(STORE_KEYS.SETTINGS)
    if (settings && settings.muteAudioWhenDictating) {
      console.info('[Audio] Muting system audio for dictation')
      muteSystemAudio()
    }

    console.info('[Audio] Starting ItoController interaction')
    const started = await itoController.startInteraction(mode)
    console.info('[Audio] ItoController.startInteraction returned:', started)
    if (!started) {
      console.warn(
        '[Audio] Transcription did not start, skipping recorder start',
      )
      return
    }
    console.info('[Audio] Starting audio recorder with device:', deviceId)
    audioRecorderService.startRecording(deviceId)
    console.info('[Audio] Audio recorder started')

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
    console.info('[Audio] Stopping STT service')
    audioRecorderService.stopRecording()
    console.info('[Audio] Audio recorder stopped, waiting for drain...')

    // Wait for explicit drain-complete signal from the recorder (with timeout fallback)
    try {
      await (audioRecorderService as any).awaitDrainComplete?.(500)
      console.info('[Audio] Drain complete')
    } catch (e) {
      console.warn('[Audio] drain-complete wait failed, proceeding:', e)
    }

    console.info('[Audio] Ending ItoController interaction')
    itoController.endInteraction()
    console.info('[Audio] ItoController interaction ended')

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
        console.log('[VoiceInputService] Received audio-config:', { outputSampleRate, sampleRate, effectiveRate })
        itoController.setAudioConfig({ sampleRate: effectiveRate })
      },
    )
    audioRecorderService.on('audio-chunk', chunk => {
      console.log('[VoiceInputService] Received audio-chunk:', chunk.length, 'bytes')
      itoController.forwardAudioChunk(chunk)
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
