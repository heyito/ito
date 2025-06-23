import type { ConnectRouter } from '@connectrpc/connect'
import { ItoService } from '../generated/ito_connect.js'
import {
  HealthCheckRequest,
  HealthCheckResponse,
  TranscribeFileRequest,
  TranscriptionResponse,
  AudioChunk,
  HealthCheckRequestSchema,
  HealthCheckResponseSchema,
  TranscribeFileRequestSchema,
  TranscriptionResponseSchema,
  AudioChunkSchema,
  ItoService as ItoServiceDesc,
} from '../generated/ito_pb.js'
import { authenticateWithScopes } from '../middleware/connectAuth0Bridge.js'
import { create } from '@bufbuild/protobuf'
import type { HandlerContext } from '@connectrpc/connect'

// Export the service implementation as a function that takes a ConnectRouter
export default (router: ConnectRouter) => {
  router.service(ItoServiceDesc, {
    // Transcribe file implementation
    async transcribeFile(
      request: TranscribeFileRequest,
      context: HandlerContext,
    ) {
      // Auth0 authentication is handled at the Fastify route level
      // Extract the authenticated user and check scopes if needed
      const user = authenticateWithScopes(context, ['read:transcription'])

      // Validate audio data exists
      if (!request.audioData || request.audioData.length === 0) {
        throw new Error('No audio data received')
      }

      console.log(`Received TranscribeFile request from user: ${user.sub}`)
      console.log(
        `Processing audio file of size: ${request.audioData.length} bytes for user: ${user.sub}`,
      )

      // TODO: Replace with actual call to Groq/Gemini STT
      const dummyTranscript = 'This is a transcript from the whole file.'

      return create(TranscriptionResponseSchema, {
        transcript: dummyTranscript,
      })
    },

    // Transcribe stream implementation
    async transcribeStream(
      requests: AsyncIterable<AudioChunk>,
      context: HandlerContext,
    ) {
      // Auth0 authentication is handled at the Fastify route level
      // Extract the authenticated user and check scopes if needed
      const user = authenticateWithScopes(context, [
        'read:transcription',
        'write:transcription',
      ])

      console.log(`Client has started streaming audio. User: ${user.sub}`)

      const audioChunks: Uint8Array[] = []

      // Process each audio chunk from the stream
      for await (const chunk of requests) {
        console.log(
          `Received audio chunk of size: ${chunk.audioData.length} from user: ${user.sub}`,
        )
        audioChunks.push(chunk.audioData)
      }

      console.log(
        `Client finished streaming. Processing final audio for user: ${user.sub}`,
      )

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
        `Processing final concatenated audio of size: ${fullAudio.length} bytes for user: ${user.sub}`,
      )

      // TODO: Replace with actual call to Groq/Gemini STT
      const dummyTranscript = 'This is a transcript from the streamed audio.'

      return create(TranscriptionResponseSchema, {
        transcript: dummyTranscript,
      })
    },
  })
}
