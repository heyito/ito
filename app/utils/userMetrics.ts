import { Interaction } from '@/lib/main/sqlite/models'

/**
 * Get the start of the current week (Monday at 00:00:00)
 */
export const getStartOfWeek = (date: Date = new Date()): Date => {
  const start = new Date(date)
  const day = start.getDay()
  // Convert Sunday (0) to 7, then subtract to get to Monday
  const diff = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  return start
}

/**
 * Calculate total words from all interactions
 */
export const calculateTotalWords = (interactions: Interaction[]): number => {
  return interactions.reduce((total, interaction) => {
    const transcript = interaction.asr_output?.transcript?.trim()
    if (transcript) {
      // Count words by splitting on whitespace and filtering out empty strings
      const words = transcript
        .split(/\s+/)
        .filter((word: string) => word.length > 0)
      return total + words.length
    }
    return total
  }, 0)
}

/**
 * Calculate word count for the current week (Monday - Sunday)
 */
export const calculateWeeklyWordCount = (
  interactions: Interaction[],
): number => {
  const weekStart = getStartOfWeek()

  const weeklyInteractions = interactions.filter(interaction => {
    const interactionDate = new Date(interaction.created_at)
    return interactionDate >= weekStart
  })

  return calculateTotalWords(weeklyInteractions)
}

/**
 * Calculate average words per minute across all interactions
 */
export const calculateAverageWPM = (interactions: Interaction[]): number => {
  const validInteractions = interactions.filter(
    interaction =>
      interaction.asr_output?.transcript?.trim() && interaction.duration_ms,
  )

  if (validInteractions.length === 0) return 0

  let totalWords = 0
  let totalDurationMs = 0

  validInteractions.forEach(interaction => {
    const transcript = interaction.asr_output?.transcript?.trim()
    if (transcript && interaction.duration_ms) {
      // Count words by splitting on whitespace and filtering out empty strings
      const words = transcript
        .split(/\s+/)
        .filter((word: string) => word.length > 0)
      totalWords += words.length
      totalDurationMs += interaction.duration_ms
    }
  })

  if (totalDurationMs === 0) return 0

  // Calculate WPM: (total words / total duration in minutes)
  const totalMinutes = totalDurationMs / (1000 * 60)
  const wpm = totalWords / totalMinutes

  // Round to nearest integer and ensure it's reasonable
  return Math.round(Math.max(1, wpm))
}

/**
 * Calculate consecutive days streak (from most recent day backwards)
 */
export const calculateStreak = (interactions: Interaction[]): number => {
  if (interactions.length === 0) return 0

  // Group interactions by date
  const dateGroups = new Map<string, Interaction[]>()
  interactions.forEach(interaction => {
    const date = new Date(interaction.created_at).toDateString()
    if (!dateGroups.has(date)) {
      dateGroups.set(date, [])
    }
    dateGroups.get(date)!.push(interaction)
  })

  // Sort dates in descending order (most recent first)
  const sortedDates = Array.from(dateGroups.keys()).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  )

  let streak = 0
  const today = new Date()

  for (let i = 0; i < sortedDates.length; i++) {
    const currentDate = new Date(sortedDates[i])
    const expectedDate = new Date(today)
    expectedDate.setDate(today.getDate() - i)

    // Check if current date matches expected date (allowing for today or previous consecutive days)
    if (currentDate.toDateString() === expectedDate.toDateString()) {
      streak++
    } else {
      break
    }
  }

  return streak
}

/**
 * Calculate all interaction statistics at once
 */
export interface InteractionStats {
  streakDays: number
  totalWords: number
  weeklyWords: number
  averageWPM: number
}

export const calculateAllStats = (
  interactions: Interaction[],
): InteractionStats => {
  if (interactions.length === 0) {
    return { streakDays: 0, totalWords: 0, weeklyWords: 0, averageWPM: 0 }
  }

  return {
    streakDays: calculateStreak(interactions),
    totalWords: calculateTotalWords(interactions),
    weeklyWords: calculateWeeklyWordCount(interactions),
    averageWPM: calculateAverageWPM(interactions),
  }
}
