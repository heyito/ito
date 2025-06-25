import type { ConnectRouter } from '@connectrpc/connect'
import {
  TranscribeFileRequest,
  AudioChunk,
  TranscriptionResponseSchema,
  ItoService as ItoServiceDesc,
} from '../generated/ito_pb.js'
import { create } from '@bufbuild/protobuf'
import type { HandlerContext } from '@connectrpc/connect'

// Export the service implementation as a function that takes a ConnectRouter
export default (router: ConnectRouter) => {
  router.service(ItoServiceDesc, {
    // Transcribe file implementation
    async transcribeFile(request: TranscribeFileRequest) {
      // Validate audio data exists
      if (!request.audioData || request.audioData.length === 0) {
        throw new Error('No audio data received')
      }

      // TODO: Replace with actual call to Groq/Gemini STT
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

      // TODO: Replace with actual call to Groq/Gemini STT
      const dummyTranscript = 'This is a transcript from the streamed audio.'

      return create(TranscriptionResponseSchema, {
        transcript: dummyTranscript,
      })
    },
  })
}
