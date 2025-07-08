import React, { useEffect, useState } from 'react'
import { InfoCircle, Play } from '@mynaui/icons-react'
import { useSettingsStore } from '../../../store/useSettingsStore'
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip'
import { useAuthStore } from '@/app/store/useAuthStore'

interface Interaction {
  id: string
  user_id: string | null
  title: string | null
  asr_output: {
    transcript: string
    audioChunkCount: number
    totalAudioBytes: number
    error: string | null
    timestamp: string
  } | null
  llm_output: any
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export default function HomeContent() {
  const { keyboardShortcut } = useSettingsStore()
  const { user } = useAuthStore()
  const firstName = user?.name?.split(' ')[0]
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loading, setLoading] = useState(true)
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)

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
  }, [])

  const loadInteractions = async () => {
    try {
      const allInteractions = await window.api.interactions.getAll()

      // Sort by creation date (newest first) - remove the slice(0, 10) to show all interactions
      const sortedInteractions = allInteractions.sort(
        (a: Interaction, b: Interaction) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      setInteractions(sortedInteractions)
    } catch (error) {
      console.error('Failed to load interactions:', error)
    } finally {
      setLoading(false)
    }
  }

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

      audio.onerror = async error => {
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

  return (
    <div className="w-full h-full flex flex-col">
      {/* Fixed Header Content */}
      <div className="flex-shrink-0 px-36">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-medium">
              Welcome back{firstName ? `, ${firstName}!` : '!'}
            </h1>
          </div>
          <div className="flex items-center text-sm text-gray-700">
            <span className="flex items-center gap-1 bg-slate-100 px-3 py-2 rounded-l-2xl relative after:content-[''] after:absolute after:right-0 after:top-[17.5%] after:h-[65%] after:w-[2px] after:bg-slate-200">
              🔥 1 week
            </span>
            <span className="flex items-center gap-1 bg-slate-100 px-3 py-2 relative after:content-[''] after:absolute after:right-0 after:top-[17.5%] after:h-[65%] after:w-[2px] after:bg-slate-200">
              🚀 7 words
            </span>
            <span className="flex items-center gap-1 bg-slate-100 px-3 py-2 rounded-r-2xl">
              👍 88 WPM
            </span>
          </div>
        </div>
        <div className="w-full h-[1px] bg-slate-200 my-10"></div>

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
          <button className="bg-gray-900 text-white px-4 py-2 rounded-md font-semibold hover:bg-gray-800 cursor-pointer">
            Explore use cases
          </button>
        </div>

        {/* Recent Activity Header */}
        <div className="text-sm text-muted-foreground mb-6">
          Recent activity
        </div>
      </div>

      {/* Scrollable Recent Activity Section */}
      <div className="flex-1 px-36 overflow-y-auto scrollbar-hide">
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

                        {/* Play button - only shows on hover or when playing */}
                        <div
                          className={`${playingAudio === interaction.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-200`}
                        >
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
