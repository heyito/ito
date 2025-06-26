import type { ConnectRouter } from '@connectrpc/connect'
import {
  TranscribeFileRequest,
  AudioChunk,
  TranscriptionResponseSchema,
  ItoService as ItoServiceDesc,
} from '../generated/ito_pb.js'
import { create } from '@bufbuild/protobuf'
import type { HandlerContext } from '@connectrpc/connect'
import { groqClient } from '../clients/groqClient.js'
 
/**
 * --- NEW: WAV Header Generation Function ---
 * Creates a 44-byte WAV header for raw PCM audio data.
 * @param dataLength The length of the raw audio data in bytes.
 * @param sampleRate The sample rate (e.g., 44100).
 * @param channelCount The number of channels (1 for mono, 2 for stereo).
 * @param bitDepth The bit depth (e.g., 16).
 * @returns A Buffer containing the WAV header.
 */
function createWavHeader(
  dataLength: number,
  sampleRate: number,
  channelCount: number,
  bitDepth: number,
): Buffer {
  const header = Buffer.alloc(44)

  // RIFF chunk descriptor
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLength, 4) // ChunkSize
  header.write('WAVE', 8)

  // "fmt " sub-chunk
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20) // AudioFormat (1 for PCM)
  header.writeUInt16LE(channelCount, 22)
  header.writeUInt32LE(sampleRate, 24)

  const blockAlign = channelCount * (bitDepth / 8)
  const byteRate = sampleRate * blockAlign

  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitDepth, 34)

  // "data" sub-chunk
  header.write('data', 36)
  header.writeUInt32LE(dataLength, 40)

  return header
}

// Export the service implementation as a function that takes a ConnectRouter
export default (router: ConnectRouter) => {
  router.service(ItoServiceDesc, {
    // Transcribe file implementation
    async transcribeFile(request: TranscribeFileRequest) {
      // Validate audio data exists
      if (!request.audioData || request.audioData.length === 0) {
        throw new Error('No audio data received')
      }

      const dummyTranscript = 'This is a transcript from the whole file.'

      return create(TranscriptionResponseSchema, {
        transcript: dummyTranscript,
      })
    },

    // Transcribe stream implementation
    async transcribeStream(
      requests: AsyncIterable<AudioChunk>,
      _context: HandlerContext,
    ) {
      const audioChunks: Uint8Array[] = []

      // Process each audio chunk from the stream
      for await (const chunk of requests) {
        console.log(`Received audio chunk of size: ${chunk.audioData.length}`)
        audioChunks.push(chunk.audioData)
      }
      // Concatenate all audio chunks
      const totalLength = audioChunks.reduce(
        (sum, chunk) => sum + chunk.length,
        0,
      )
      const fullAudio = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of audioChunks) {
        fullAudio.set(chunk, offset)
        offset += chunk.length
      }

      console.log(
        `Processing final concatenated audio of size: ${fullAudio.length} bytes}`,
      )

      try {
        // --- THIS IS THE FIX ---
        // 1. Set audio properties to match the new capture settings.
        const sampleRate = 16000 // Correct sample rate
        const bitDepth = 16
        const channels = 1 // Mono

        // 2. Create the header with the correct properties.
        const wavHeader = createWavHeader(
          fullAudio.length,
          sampleRate,
          channels,
          bitDepth,
        )
        const fullAudioWAV = Buffer.concat([wavHeader, fullAudio])

        // 3. Send the corrected WAV file.
        const transcript = await groqClient.transcribeAudio(fullAudioWAV, 'wav')

        console.log(`Successfully transcribed: ${transcript}`)
        return create(TranscriptionResponseSchema, {
          transcript,
        })
      } catch (error: any) {
        console.error('Failed to process transcription via GroqClient:', error)
        // return error response
        return create(TranscriptionResponseSchema, {
          transcript: `Error processing transcription: ${error?.message}`,
        })
      }
    },
  })
}
