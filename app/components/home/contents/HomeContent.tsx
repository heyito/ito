import React, { useCallback, useEffect, useState } from 'react'
import {
  ChartNoAxesColumn,
  InfoCircle,
  Play,
  Copy,
  Check,
} from '@mynaui/icons-react'
import { EXTERNAL_LINKS } from '@/lib/constants/external-links'
import { useSettingsStore } from '../../../store/useSettingsStore'
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip'
import { useAuthStore } from '@/app/store/useAuthStore'
import { Interaction } from '@/lib/main/sqlite/models'
import { TotalWordsIcon } from '../../icons/TotalWordsIcon'
import { SpeedIcon } from '../../icons/SpeedIcon'
import {
  STREAK_MESSAGES,
  SPEED_MESSAGES,
  TOTAL_WORDS_MESSAGES,
  getStreakLevel,
  getSpeedLevel,
  getTotalWordsLevel,
  getRandomMessage,
} from './activityMessages'

// Interface for interaction statistics
interface InteractionStats {
  streakDays: number
  totalWords: number
  averageWPM: number
}

const StatCard = ({
  title,
  value,
  description,
  icon,
}: {
  title: string
  value: string
  description: string
  icon: React.ReactNode
}) => {
  return (
    <div className="flex flex-col p-4 w-1/3 border-2 border-neutral-100 rounded-xl gap-4">
      <div className="flex flex-row items-center">
        <div className="flex flex-col gap-1">
          <div>{title}</div>
          <div className="font-bold">{value}</div>
        </div>
        <div className="flex flex-col items-end flex-1">{icon}</div>
      </div>
      <div className="w-full text-neutral-400">{description}</div>
    </div>
  )
}

export default function HomeContent() {
  const { keyboardShortcut } = useSettingsStore()
  const { user } = useAuthStore()
  const firstName = user?.name?.split(' ')[0]
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loading, setLoading] = useState(true)
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set())
  const [tooltipOpen, setTooltipOpen] = useState<string | null>(null)
  const [stats, setStats] = useState<InteractionStats>({
    streakDays: 0,
    totalWords: 0,
    averageWPM: 0,
  })

  // Calculate statistics from interactions
  const calculateStats = useCallback(
    (interactions: Interaction[]): InteractionStats => {
      if (interactions.length === 0) {
        return { streakDays: 0, totalWords: 0, averageWPM: 0 }
      }

      // Calculate streak (consecutive days with interactions)
      const streakDays = calculateStreak(interactions)

      // Calculate total words from transcripts
      const totalWords = calculateTotalWords(interactions)

      // Calculate average WPM (estimate based on average speaking rate)
      const averageWPM = calculateAverageWPM(interactions)

      return { streakDays, totalWords, averageWPM }
    },
    [],
  )

  const calculateStreak = (interactions: Interaction[]): number => {
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

  const calculateTotalWords = (interactions: Interaction[]): number => {
    return interactions.reduce((total, interaction) => {
      const transcript = interaction.asr_output?.transcript?.trim()
      if (transcript) {
        // Count words by splitting on whitespace and filtering out empty strings
        const words = transcript.split(/\s+/).filter(word => word.length > 0)
        return total + words.length
      }
      return total
    }, 0)
  }

  const calculateAverageWPM = (interactions: Interaction[]): number => {
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
        const words = transcript.split(/\s+/).filter(word => word.length > 0)
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

  const formatStreakText = (days: number): string => {
    if (days === 0) return '0 days'
    if (days === 1) return '1 day'
    if (days < 7) return `${days} days`
    if (days < 14) return '1 week'
    if (days < 30) return `${Math.floor(days / 7)} weeks`
    if (days < 60) return '1 month'
    return `${Math.floor(days / 30)} months`
  }

  const loadInteractions = useCallback(async () => {
    try {
      const allInteractions = await window.api.interactions.getAll()

      // Sort by creation date (newest first) - remove the slice(0, 10) to show all interactions
      const sortedInteractions = allInteractions.sort(
        (a: Interaction, b: Interaction) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      setInteractions(sortedInteractions)

      // Calculate and set statistics
      const calculatedStats = calculateStats(sortedInteractions)
      setStats(calculatedStats)
    } catch (error) {
      console.error('Failed to load interactions:', error)
    } finally {
      setLoading(false)
    }
  }, [calculateStats])

  useEffect(() => {
    loadInteractions()

    // Listen for new interactions
    const handleInteractionCreated = () => {
      console.log('[HomeContent] New interaction created, refreshing list...')
      loadInteractions()
    }

    const unsubscribe = window.api.on(
      'interaction-created',
      handleInteractionCreated,
    )

    // Cleanup listener on unmount
    return unsubscribe
  }, [loadInteractions])

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    const isToday = date.toDateString() === today.toDateString()
    const isYesterday = date.toDateString() === yesterday.toDateString()

    if (isToday) return 'TODAY'
    if (isYesterday) return 'YESTERDAY'

    return date
      .toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
      .toUpperCase()
  }

  const groupInteractionsByDate = (interactions: Interaction[]) => {
    const groups: { [key: string]: Interaction[] } = {}

    interactions.forEach(interaction => {
      const dateKey = formatDate(interaction.created_at)
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(interaction)
    })

    return groups
  }

  const getDisplayText = (interaction: Interaction) => {
    // Check for errors first
    if (interaction.asr_output?.error) {
      return {
        text: 'Transcription failed',
        isError: true,
        tooltip: interaction.asr_output.error,
      }
    }

    // Check for empty transcript
    const transcript = interaction.asr_output?.transcript?.trim()

    if (!transcript) {
      return {
        text: 'Audio is silent.',
        isError: true,
        tooltip: "Ito didn't detect any words so the transcript is empty",
      }
    }

    // Return the actual transcript
    return {
      text: transcript,
      isError: false,
      tooltip: null,
    }
  }

  // Utility function to create WAV file from raw PCM data
  const createWavFile = (
    pcmData: Uint8Array,
    sampleRate = 16000,
    numChannels = 1,
    bitsPerSample = 16,
  ) => {
    const dataLength = pcmData.length
    const buffer = new ArrayBuffer(44 + dataLength)
    const view = new DataView(buffer)

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF') // ChunkID
    view.setUint32(4, 36 + dataLength, true) // ChunkSize
    writeString(8, 'WAVE') // Format
    writeString(12, 'fmt ') // Subchunk1ID
    view.setUint32(16, 16, true) // Subchunk1Size (PCM)
    view.setUint16(20, 1, true) // AudioFormat (PCM)
    view.setUint16(22, numChannels, true) // NumChannels
    view.setUint32(24, sampleRate, true) // SampleRate
    view.setUint32(28, (sampleRate * numChannels * bitsPerSample) / 8, true) // ByteRate
    view.setUint16(32, (numChannels * bitsPerSample) / 8, true) // BlockAlign
    view.setUint16(34, bitsPerSample, true) // BitsPerSample
    writeString(36, 'data') // Subchunk2ID
    view.setUint32(40, dataLength, true) // Subchunk2Size

    // Copy PCM data
    const uint8Array = new Uint8Array(buffer)
    uint8Array.set(pcmData, 44)

    return buffer
  }

  const playAudio = async (interaction: Interaction) => {
    try {
      // Stop any currently playing audio
      if (playingAudio) {
        setPlayingAudio(null)
        // Small delay to ensure previous audio stops
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      if (!interaction.raw_audio) {
        console.warn('No audio data available for this interaction')
        return
      }

      setPlayingAudio(interaction.id)

      // Convert Buffer to Uint8Array for browser compatibility
      const pcmData = new Uint8Array(interaction.raw_audio)

      // Try to play as-is first (in case it's already a valid audio format)
      let audioBlob = new Blob([pcmData], { type: 'audio/wav' })
      let audioUrl = URL.createObjectURL(audioBlob)

      // Create and play the audio
      const audio = new Audio(audioUrl)

      audio.onended = () => {
        setPlayingAudio(null)
        URL.revokeObjectURL(audioUrl) // Clean up memory
      }

      audio.onerror = async _error => {
        console.log(
          'Direct playback failed, trying as raw PCM with WAV headers...',
        )
        URL.revokeObjectURL(audioUrl)

        try {
          // If direct playback fails, try converting raw PCM to WAV
          const wavBuffer = createWavFile(pcmData)
          audioBlob = new Blob([wavBuffer], { type: 'audio/wav' })
          audioUrl = URL.createObjectURL(audioBlob)

          const newAudio = new Audio(audioUrl)
          newAudio.onended = () => {
            setPlayingAudio(null)
            URL.revokeObjectURL(audioUrl)
          }
          newAudio.onerror = err => {
            console.error('WAV playback also failed:', err)
            setPlayingAudio(null)
            URL.revokeObjectURL(audioUrl)
          }

          await newAudio.play()
        } catch (wavError) {
          console.error('Failed to create/play WAV file:', wavError)
          setPlayingAudio(null)
        }
      }

      await audio.play()
    } catch (error) {
      console.error('Failed to play audio:', error)
      setPlayingAudio(null)
    }
  }

  const groupedInteractions = groupInteractionsByDate(interactions)

  const copyToClipboard = async (text: string, interactionId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedItems(prev => new Set(prev).add(interactionId))
      setTooltipOpen(interactionId) // Keep tooltip open

      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setCopiedItems(prev => {
          const newSet = new Set(prev)
          newSet.delete(interactionId)
          return newSet
        })
        // Close tooltip if it's still open for this item
        setTooltipOpen(prev => (prev === interactionId ? null : prev))
      }, 2000)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Fixed Header Content */}
      <div className="flex-shrink-0 px-24">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-medium">
              Welcome back{firstName ? `, ${firstName}!` : '!'}
            </h1>
          </div>
        </div>
        <div className="flex gap-4 w-full mb-6">
          <div className="flex w-full items-center text-sm text-gray-700 gap-2">
            <StatCard
              title="Weekly Streak"
              value={formatStreakText(stats.streakDays)}
              description={getRandomMessage(
                STREAK_MESSAGES,
                getStreakLevel(stats.streakDays),
              )}
              icon={
                <div className="p-2 bg-blue-50 rounded-md">
                  <ChartNoAxesColumn
                    className="w-6 h-6 text-blue-400 border-2 p-1 rounded-full"
                    strokeWidth={4}
                  />
                </div>
              }
            />
            <StatCard
              title="Average Speed"
              value={`${stats.averageWPM} words / minute`}
              description={getRandomMessage(
                SPEED_MESSAGES,
                getSpeedLevel(stats.averageWPM),
              )}
              icon={
                <div className="p-2 bg-green-50 rounded-md">
                  <SpeedIcon />
                </div>
              }
            />
            <StatCard
              title="Total Words"
              value={`${stats.totalWords} ${stats.totalWords === 1 ? 'word' : 'words'}`}
              description={getRandomMessage(
                TOTAL_WORDS_MESSAGES,
                getTotalWordsLevel(stats.totalWords),
              )}
              icon={
                <div className="p-2 bg-orange-50 rounded-md">
                  <TotalWordsIcon />
                </div>
              }
            />
          </div>
        </div>

        {/* Dictation Info Box */}
        <div className="bg-slate-100 rounded-xl p-6 flex items-center justify-between mb-10">
          <div>
            <div className="text-base font-medium mb-1">
              Voice dictation in any app
            </div>
            <div className="text-sm text-gray-600">
              <span key="hold-down">Hold down the trigger key </span>
              {keyboardShortcut.map((key, index) => (
                <React.Fragment key={index}>
                  <span className="bg-slate-50 px-1 py-0.5 rounded text-xs font-mono shadow-sm">
                    {key}
                  </span>
                  <span>{index < keyboardShortcut.length - 1 && ' + '}</span>
                </React.Fragment>
              ))}
              <span key="and"> and speak into any textbox</span>
            </div>
          </div>
          <button
            className="bg-gray-900 text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 cursor-pointer"
            onClick={() =>
              window.api?.invoke('web-open-url', EXTERNAL_LINKS.WEBSITE)
            }
          >
            Explore use cases
          </button>
        </div>

        {/* Recent Activity Header */}
        <div className="text-sm text-muted-foreground mb-6">
          Recent activity
        </div>
      </div>

      {/* Scrollable Recent Activity Section */}
      <div className="flex-1 px-24 overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-gray-500">
            Loading recent activity...
          </div>
        ) : interactions.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-gray-500">
            <p className="text-sm">No interactions yet</p>
            <p className="text-xs mt-1">
              Try using voice dictation by pressing{' '}
              {keyboardShortcut.join(' + ')}
            </p>
          </div>
        ) : (
          Object.entries(groupedInteractions).map(
            ([dateLabel, dateInteractions]) => (
              <div key={dateLabel} className="mb-6">
                <div className="text-xs text-gray-500 mb-4">{dateLabel}</div>
                <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-200">
                  {dateInteractions.map(interaction => {
                    const displayInfo = getDisplayText(interaction)

                    return (
                      <div
                        key={interaction.id}
                        className="flex items-center justify-between px-4 py-4 gap-10 hover:bg-gray-50 transition-colors duration-200 group"
                      >
                        <div className="flex items-center gap-10">
                          <div className="text-gray-600 min-w-[60px]">
                            {formatTime(interaction.created_at)}
                          </div>
                          <div
                            className={`${displayInfo.isError ? 'text-gray-600' : 'text-gray-900'} flex items-center gap-1`}
                          >
                            {displayInfo.text}
                            {displayInfo.tooltip && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <InfoCircle className="w-4 h-4 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {displayInfo.tooltip}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>

                        {/* Copy and Play buttons - only show on hover or when playing */}
                        <div
                          className={`flex items-center gap-2 ${playingAudio === interaction.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-200`}
                        >
                          {/* Copy button */}
                          {!displayInfo.isError && (
                            <Tooltip
                              open={tooltipOpen === interaction.id}
                              onOpenChange={open => {
                                if (!copiedItems.has(interaction.id)) {
                                  setTooltipOpen(open ? interaction.id : null)
                                }
                              }}
                            >
                              <TooltipTrigger asChild>
                                <button
                                  className={`p-1.5 hover:bg-gray-200 rounded transition-colors cursor-pointer ${
                                    copiedItems.has(interaction.id)
                                      ? 'text-green-600'
                                      : 'text-gray-600'
                                  }`}
                                  onClick={() =>
                                    copyToClipboard(
                                      displayInfo.text,
                                      interaction.id,
                                    )
                                  }
                                >
                                  {copiedItems.has(interaction.id) ? (
                                    <Check className="w-4 h-4" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {copiedItems.has(interaction.id)
                                    ? 'Copied 🎉'
                                    : 'Copy'}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Play button */}
                          <button
                            className={`p-1.5 hover:bg-gray-200 rounded transition-colors cursor-pointer ${
                              playingAudio === interaction.id
                                ? 'bg-blue-50 text-blue-600'
                                : 'text-gray-600'
                            }`}
                            onClick={() => playAudio(interaction)}
                            disabled={!interaction.raw_audio}
                            title={
                              !interaction.raw_audio
                                ? 'No audio available'
                                : playingAudio === interaction.id
                                  ? 'Playing audio...'
                                  : 'Play audio'
                            }
                          >
                            <Play
                              className={`w-4 h-4 ${playingAudio === interaction.id ? 'animate-pulse' : ''}`}
                            />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ),
          )
        )}
      </div>
    </div>
  )
}
