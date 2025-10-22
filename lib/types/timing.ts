/**
 * Timing analytics types for client
 *
 * IMPORTANT: Keep in sync with server/src/services/timing.ts
 * These types are duplicated because client and server are separate build artifacts
 */

export interface TimingEvent {
  name: string
  start_ms: number
  end_ms?: number
  duration_ms?: number
}

export interface TimingReport {
  interaction_id: string
  user_id: string
  platform: string
  timestamp: string
  events: TimingEvent[]
  total_duration_ms: number
}
