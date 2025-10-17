import { audioRecorderService } from '../media/audio'
import { muteSystemAudio, unmuteSystemAudio } from '../media/systemAudio'
import { getPillWindow, mainWindow } from './app'
import store from './store'
import { STORE_KEYS } from '../constants/store-keys'
import { itoController } from './itoController'
import { ItoMode } from '@/app/generated/ito_pb'
import { IPC_EVENTS, RecordingStatePayload } from '../types/ipc'

export class VoiceInputService {
  /**
   * Starts audio recording and handles system audio muting.
   * Does NOT start the ItoController - that should be done separately.
   */
  public startAudioRecording = () => {
    const deviceId = store.get(STORE_KEYS.SETTINGS).microphoneDeviceId

    console.info('[VoiceInputService] Starting audio recording')

    const settings = store.get(STORE_KEYS.SETTINGS)
    const recordingDeviceId = deviceId || settings.microphoneDeviceId

    // Mute system audio if needed
    if (settings && settings.muteAudioWhenDictating) {
      console.info('[VoiceInputService] Muting system audio for dictation')
      muteSystemAudio()
    }

    // Start audio recorder
    console.info(
      '[VoiceInputService] Starting audio recorder with device:',
      recordingDeviceId,
    )
    audioRecorderService.startRecording(recordingDeviceId)

    console.info('[VoiceInputService] Audio recording started')
  }

  /**
   * Stops audio recording and handles system audio unmuting.
   * Waits for the audio recorder to drain before returning.
   */
  public stopAudioRecording = async () => {
    console.info('[VoiceInputService] Stopping audio recording')
    audioRecorderService.stopRecording()
    console.info(
      '[VoiceInputService] Audio recorder stopped, waiting for drain...',
    )

    // Wait for explicit drain-complete signal from the recorder (with timeout fallback)
    try {
      await (audioRecorderService as any).awaitDrainComplete?.(500)
      console.info('[VoiceInputService] Drain complete')
    } catch (e) {
      console.warn(
        '[VoiceInputService] drain-complete wait failed, proceeding:',
        e,
      )
    }

    // Unmute system audio if it was muted
    if (store.get(STORE_KEYS.SETTINGS).muteAudioWhenDictating) {
      console.info('[VoiceInputService] Unmuting system audio after dictation')
      unmuteSystemAudio()
    }

    console.info('[VoiceInputService] Audio recording stopped')
  }

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
    }
    getPillWindow()?.webContents.send(
      IPC_EVENTS.RECORDING_STATE_UPDATE,
      recordingStatePayload,
    )
  }

  public setUpAudioRecorderListeners = () => {
    // Note: audio-chunk and audio-config are now handled directly by ItoController
    // when the gRPC stream starts. VoiceInputService only handles UI-related events.

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
