import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { ItoMode } from '@/app/generated/ito_pb'

/**
 * Timing events that occur during an ITO interaction lifecycle
 */
export enum TimingEvent {
  // Hotkey & Initialization
  HOTKEY_PRESSED = 'hotkey_pressed',
  HOTKEY_DEBOUNCE_START = 'hotkey_debounce_start',
  HOTKEY_ACTIVATED = 'hotkey_activated',

  // Audio Recording
  AUDIO_RECORDER_START = 'audio_recorder_start',
  AUDIO_RECORDER_STARTED = 'audio_recorder_started',
  AUDIO_FIRST_CHUNK = 'audio_first_chunk',
  AUDIO_RECORDER_STOP = 'audio_recorder_stop',
  AUDIO_RECORDER_STOPPED = 'audio_recorder_stopped',

  // Transcription Service
  TRANSCRIPTION_START = 'transcription_start',
  TRANSCRIPTION_GRPC_CONNECT = 'transcription_grpc_connect',
  TRANSCRIPTION_GRPC_CONNECTED = 'transcription_grpc_connected',
  TRANSCRIPTION_FIRST_AUDIO_SENT = 'transcription_first_audio_sent',
  TRANSCRIPTION_STOP = 'transcription_stop',
  TRANSCRIPTION_FINALIZE = 'transcription_finalize',

  // Server Response
  SERVER_FIRST_RESPONSE = 'server_first_response',
  SERVER_FINAL_RESPONSE = 'server_final_response',
  SERVER_ERROR = 'server_error',

  // Output & Completion
  OUTPUT_START = 'output_start',
  OUTPUT_PASTE_START = 'output_paste_start',
  OUTPUT_PASTE_COMPLETE = 'output_paste_complete',
  OUTPUT_TYPE_START = 'output_type_start',
  OUTPUT_TYPE_COMPLETE = 'output_type_complete',
  OUTPUT_COMPLETE = 'output_complete',

  // Full Lifecycle
  INTERACTION_COMPLETE = 'interaction_complete',
}

export interface TimingEntry {
  event: TimingEvent
  timestamp: number
  metadata?: Record<string, any>
}

export interface InteractionTiming {
  id: string
  startTime: number
  endTime?: number
  mode?: ItoMode
  events: TimingEntry[]
  durations?: {
    totalDuration?: number
    hotkeyToAudio?: number
    audioToTranscription?: number
    transcriptionToResponse?: number
    responseToOutput?: number
    outputDuration?: number
  }
}

class TimingService {
  private interactions: Map<string, InteractionTiming> = new Map()
  private currentInteractionId: string | null = null
  private timingDataDir: string

  constructor() {
    // Create directory for timing data in project root
    this.timingDataDir = join(process.cwd(), 'timing-data')
    if (!existsSync(this.timingDataDir)) {
      mkdirSync(this.timingDataDir, { recursive: true })
    }
  }

  /**
   * Start tracking a new interaction
   */
  startInteraction(id: string, mode?: ItoMode): void {
    const now = Date.now()

    const interaction: InteractionTiming = {
      id,
      startTime: now,
      mode,
      events: [{
        event: TimingEvent.HOTKEY_PRESSED,
        timestamp: now,
        metadata: { mode }
      }]
    }

    this.interactions.set(id, interaction)
    this.currentInteractionId = id

    console.info(`[Timing] Started tracking interaction: ${id}`)
  }

  /**
   * Record a timing event for the current interaction
   */
  recordEvent(event: TimingEvent, metadata?: Record<string, any>): void {
    if (!this.currentInteractionId) {
      console.warn(`[Timing] No active interaction for event: ${event}`)
      return
    }

    this.recordEventForInteraction(this.currentInteractionId, event, metadata)
  }

  /**
   * Record a timing event for a specific interaction
   */
  recordEventForInteraction(
    interactionId: string,
    event: TimingEvent,
    metadata?: Record<string, any>
  ): void {
    const interaction = this.interactions.get(interactionId)
    if (!interaction) {
      console.warn(`[Timing] Interaction not found: ${interactionId}`)
      return
    }

    const now = Date.now()
    interaction.events.push({
      event,
      timestamp: now,
      metadata
    })

    // Calculate relative time from start
    const relativeTime = now - interaction.startTime
    console.info(`[Timing] ${event} at +${relativeTime}ms`, metadata || '')
  }

  /**
   * Complete tracking for an interaction
   */
  completeInteraction(interactionId?: string): void {
    const id = interactionId || this.currentInteractionId
    if (!id) {
      console.warn('[Timing] No interaction to complete')
      return
    }

    const interaction = this.interactions.get(id)
    if (!interaction) {
      console.warn(`[Timing] Interaction not found: ${id}`)
      return
    }

    const now = Date.now()
    interaction.endTime = now

    this.recordEventForInteraction(id, TimingEvent.INTERACTION_COMPLETE)

    // Calculate key durations
    this.calculateDurations(interaction)

    // Save to file
    this.saveInteractionData(interaction)

    // Log summary
    this.logSummary(interaction)

    // Clean up if this was the current interaction
    if (this.currentInteractionId === id) {
      this.currentInteractionId = null
    }
  }

  /**
   * Calculate key duration metrics
   */
  private calculateDurations(interaction: InteractionTiming): void {
    const events = interaction.events
    const durations: InteractionTiming['durations'] = {}

    // Total duration
    if (interaction.endTime) {
      durations.totalDuration = interaction.endTime - interaction.startTime
    }

    // Find key event timestamps
    const hotkeyActivated = events.find(e => e.event === TimingEvent.HOTKEY_ACTIVATED)
    const audioStarted = events.find(e => e.event === TimingEvent.AUDIO_RECORDER_STARTED)
    const firstAudioSent = events.find(e => e.event === TimingEvent.TRANSCRIPTION_FIRST_AUDIO_SENT)
    const firstResponse = events.find(e => e.event === TimingEvent.SERVER_FIRST_RESPONSE || e.event === TimingEvent.SERVER_FINAL_RESPONSE)
    const outputStart = events.find(e => e.event === TimingEvent.OUTPUT_START)
    const outputComplete = events.find(e => e.event === TimingEvent.OUTPUT_COMPLETE)

    // Calculate phase durations
    if (hotkeyActivated && audioStarted) {
      durations.hotkeyToAudio = audioStarted.timestamp - hotkeyActivated.timestamp
    }

    if (audioStarted && firstAudioSent) {
      durations.audioToTranscription = firstAudioSent.timestamp - audioStarted.timestamp
    }

    if (firstAudioSent && firstResponse) {
      durations.transcriptionToResponse = firstResponse.timestamp - firstAudioSent.timestamp
    }

    if (firstResponse && outputStart) {
      durations.responseToOutput = outputStart.timestamp - firstResponse.timestamp
    } else if (firstResponse && outputComplete) {
      // If no OUTPUT_START event, calculate from response to output complete
      durations.responseToOutput = outputComplete.timestamp - firstResponse.timestamp
    }

    if (outputStart && outputComplete) {
      durations.outputDuration = outputComplete.timestamp - outputStart.timestamp
    }

    interaction.durations = durations
  }

  /**
   * Save interaction data to a JSON file
   */
  private saveInteractionData(interaction: InteractionTiming): void {
    try {
      const timestamp = new Date(interaction.startTime).toISOString().replace(/[:.]/g, '-')
      const filename = `interaction-${timestamp}.json`
      const filepath = join(this.timingDataDir, filename)

      // Add relative times to each event for easier analysis
      const enrichedData = {
        ...interaction,
        events: interaction.events.map(event => ({
          ...event,
          relativeTime: event.timestamp - interaction.startTime,
          formattedTime: new Date(event.timestamp).toISOString()
        }))
      }

      writeFileSync(filepath, JSON.stringify(enrichedData, null, 2))
      console.info(`[Timing] Saved interaction data to: ${filename}`)
    } catch (error) {
      console.error('[Timing] Failed to save interaction data:', error)
    }
  }

  /**
   * Log a summary of the interaction timing
   */
  private logSummary(interaction: InteractionTiming): void {
    const durations = interaction.durations || {}

    console.info('┌─────────────────────────────────────────────')
    console.info(`│ Interaction Timing Summary: ${interaction.id}`)
    console.info('├─────────────────────────────────────────────')
    console.info(`│ Mode: ${interaction.mode === ItoMode.EDIT ? 'EDIT' : 'TRANSCRIBE'}`)
    console.info(`│ Total Duration: ${durations.totalDuration || 0}ms`)
    console.info('├─────────────────────────────────────────────')
    console.info('│ Phase Breakdown:')
    console.info(`│   Hotkey → Audio Start: ${durations.hotkeyToAudio || 'N/A'}ms`)
    console.info(`│   Audio → Transcription: ${durations.audioToTranscription || 'N/A'}ms`)
    console.info(`│   Transcription → Response: ${durations.transcriptionToResponse || 'N/A'}ms`)
    console.info(`│   Response → Output: ${durations.responseToOutput || 'N/A'}ms`)
    console.info(`│   Output Duration: ${durations.outputDuration || 'N/A'}ms`)
    console.info('└─────────────────────────────────────────────')
  }

  /**
   * Get all timing data for export/analysis
   */
  getAllInteractions(): InteractionTiming[] {
    return Array.from(this.interactions.values())
  }

  /**
   * Get current interaction ID
   */
  getCurrentInteractionId(): string | null {
    return this.currentInteractionId
  }

  /**
   * Export timing data to CSV for analysis
   */
  exportToCSV(): string {
    const interactions = this.getAllInteractions()
    const csvPath = join(this.timingDataDir, `timing-export-${Date.now()}.csv`)

    // CSV header
    let csv = 'interaction_id,mode,total_duration,hotkey_to_audio,audio_to_transcription,transcription_to_response,response_to_output,output_duration\n'

    // Add each interaction
    for (const interaction of interactions) {
      const d = interaction.durations || {}
      csv += `${interaction.id},${interaction.mode || ''},${d.totalDuration || ''},${d.hotkeyToAudio || ''},${d.audioToTranscription || ''},${d.transcriptionToResponse || ''},${d.responseToOutput || ''},${d.outputDuration || ''}\n`
    }

    writeFileSync(csvPath, csv)
    console.info(`[Timing] Exported CSV to: ${csvPath}`)
    return csvPath
  }

  /**
   * Clear old timing data
   */
  clearOldData(daysToKeep: number = 7): void {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)

    for (const [id, interaction] of this.interactions) {
      if (interaction.startTime < cutoffTime) {
        this.interactions.delete(id)
      }
    }

    console.info(`[Timing] Cleared interactions older than ${daysToKeep} days`)
  }
}

// Export singleton instance
export const timingService = new TimingService()