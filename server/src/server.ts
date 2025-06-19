import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
// Correct path to the generated types
import { ProtoGrpcType } from './generated/ito.js'
// Correct path to the generated service handler type
import { ItoServiceHandlers } from './generated/ito/ItoService.js'
import { PassThrough } from 'stream'
import { ReflectionService } from '@grpc/reflection'
import { HealthImplementation, ServingStatusMap } from 'grpc-health-check'
import { authenticateCall } from './middleware/auth.js'

// Correct path to the proto file
const PROTO_PATH = './src/ito.proto'
const HEALTH_PROTO_PATH =
  'node_modules/grpc-health-check/proto/health/v1/health.proto'

const itoPackageDefinition = protoLoader.loadSync([
  PROTO_PATH,
  HEALTH_PROTO_PATH,
])
const itoProto = grpc.loadPackageDefinition(
  itoPackageDefinition,
) as unknown as ProtoGrpcType

const statusMap: ServingStatusMap = {
  'ito.ItoService': 'SERVING',
  '': 'NOT_SERVING',
}

// Construct the service implementation
const healthImpl = new HealthImplementation(statusMap)

// Use a consistent name for the server implementation
const itoServer: ItoServiceHandlers = {
  /**
   * Implementation for the Unary (whole file) RPC method.
   */
  async TranscribeFile(call, callback) {
    // Authenticate the call
    const authResult = await authenticateCall(call, callback)
    if (!authResult) {
      return // Authentication failed, error already sent via callback
    }

    // Add a check to ensure audio_data exists
    if (!call.request.audioData) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        details: 'No audio data received',
      })
    }

    console.log(
      `Received TranscribeFile request from user: ${authResult.user.sub}`,
    )
    const audioData: Buffer = call.request.audioData

    console.log(
      `Processing audio file of size: ${audioData.length} bytes for user: ${authResult.user.sub}`,
    )
    // TODO: Replace with actual call to Groq/Gemini STT
    const dummyTranscript = 'This is a transcript from the whole file.'

    callback(null, { transcript: dummyTranscript })
  },

  /**
   * Implementation for the Client-Streaming RPC method.
   */
  TranscribeStream(call, callback) {
    // Note: For streaming calls, we need to handle auth differently
    // since we can't use async/await directly in the handler signature

    const handleStream = async () => {
      // Authenticate the call
      const authResult = await authenticateCall(call, callback)
      if (!authResult) {
        return // Authentication failed, error already sent via callback
      }

      console.log(
        `Client has started streaming audio. User: ${authResult.user.sub}`,
      )
      const audioChunks: Buffer[] = []

      call.on('data', (chunk: { audio_data: Buffer }) => {
        console.log(
          `Received audio chunk of size: ${chunk.audio_data.length} from user: ${authResult.user.sub}`,
        )
        audioChunks.push(chunk.audio_data)
      })

      call.on('error', (err: Error) => {
        console.error(
          `Error during stream for user ${authResult.user.sub}:`,
          err,
        )
      })

      call.on('end', () => {
        console.log(
          `Client finished streaming. Processing final audio for user: ${authResult.user.sub}`,
        )
        const fullAudio: Buffer = Buffer.concat(audioChunks)

        // TODO: Replace with actual call to Groq/Gemini STT
        console.log(
          `Processing final concatenated audio of size: ${fullAudio.length} bytes for user: ${authResult.user.sub}`,
        )
        const dummyTranscript = 'This is a transcript from the streamed audio.'

        callback(null, { transcript: dummyTranscript })
      })
    }

    // Start handling the stream
    handleStream().catch(error => {
      console.error('Error in TranscribeStream:', error)
      callback({
        code: grpc.status.INTERNAL,
        details: 'Internal server error',
      })
    })
  },
}

export const startServer = async () => {
  const server = new grpc.Server()
  // Ensure we use the correct service definition and implementation
  server.addService(itoProto.ito.ItoService.service, itoServer)
  healthImpl.addToServer(server)
  const reflectionService = new ReflectionService(itoPackageDefinition)
  reflectionService.addToServer(server)

  const port = '0.0.0.0:3000'
  server.bindAsync(
    port,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error(err)
        return
      }
      console.log(
        `gRPC server listening on ${port} with Auth0 authentication enabled`,
      )
    },
  )

  healthImpl.setStatus('', 'SERVING')
}
