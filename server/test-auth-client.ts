import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import { ProtoGrpcType } from './src/generated/ito.js'

// Mock JWT token for testing (replace with actual Auth0 token)
const MOCK_JWT_TOKEN = process.env.TEST_JWT_TOKEN || 'your-jwt-token-here'

const PROTO_PATH = './src/ito.proto'

const packageDefinition = protoLoader.loadSync(PROTO_PATH)
const itoProto = grpc.loadPackageDefinition(
  packageDefinition,
) as unknown as ProtoGrpcType

class AuthenticatedGrpcClient {
  private client: any

  constructor(serverAddress: string = 'localhost:3000') {
    this.client = new itoProto.ito.ItoService(
      serverAddress,
      grpc.credentials.createInsecure(),
    )
  }

  // Create metadata with Auth0 JWT token
  private createAuthMetadata(): grpc.Metadata {
    const metadata = new grpc.Metadata()
    metadata.add('authorization', `Bearer ${MOCK_JWT_TOKEN}`)
    return metadata
  }

  // Test the TranscribeFile method with authentication
  async testTranscribeFile() {
    console.log('Testing TranscribeFile with authentication...')

    const audioData = Buffer.from('fake-audio-data')
    const metadata = this.createAuthMetadata()

    return new Promise((resolve, reject) => {
      this.client.TranscribeFile(
        { audioData },
        metadata,
        (error: any, response: any) => {
          if (error) {
            console.error('TranscribeFile error:', error)
            reject(error)
          } else {
            console.log('TranscribeFile response:', response)
            resolve(response)
          }
        },
      )
    })
  }

  // Test the TranscribeStream method with authentication
  async testTranscribeStream() {
    console.log('Testing TranscribeStream with authentication...')

    const metadata = this.createAuthMetadata()

    return new Promise((resolve, reject) => {
      const stream = this.client.TranscribeStream(
        metadata,
        (error: any, response: any) => {
          if (error) {
            console.error('TranscribeStream error:', error)
            reject(error)
          } else {
            console.log('TranscribeStream response:', response)
            resolve(response)
          }
        },
      )

      // Send some mock audio chunks
      stream.write({ audio_data: Buffer.from('chunk1') })
      stream.write({ audio_data: Buffer.from('chunk2') })
      stream.write({ audio_data: Buffer.from('chunk3') })

      // End the stream
      stream.end()
    })
  }

  // Test without authentication (should fail)
  async testWithoutAuth() {
    console.log('Testing without authentication (should fail)...')

    const audioData = Buffer.from('fake-audio-data')

    return new Promise((resolve, reject) => {
      this.client.TranscribeFile({ audioData }, (error: any, response: any) => {
        if (error) {
          console.log('Expected authentication error:', error)
          resolve(error)
        } else {
          console.error('Unexpected success without authentication')
          reject(new Error('Should have failed without auth'))
        }
      })
    })
  }
}

// Main test function
async function runTests() {
  const client = new AuthenticatedGrpcClient()

  console.log('='.repeat(50))
  console.log('Auth0 gRPC Client Test')
  console.log('='.repeat(50))

  try {
    // Test without authentication (should fail)
    await client.testWithoutAuth()
    console.log('✓ Authentication enforcement working')

    // Test with authentication (requires valid JWT token)
    if (MOCK_JWT_TOKEN !== 'your-jwt-token-here') {
      console.log('\n' + '-'.repeat(30))
      await client.testTranscribeFile()
      console.log('✓ TranscribeFile with auth working')
    } else {
      console.log(
        '\n⚠️  To test authenticated calls, set TEST_JWT_TOKEN environment variable',
      )
      console.log('   Get a token from your Auth0 application and run:')
      console.log('   export TEST_JWT_TOKEN="your-actual-jwt-token"')
      console.log('   tsx test-auth-client.ts')
    }
  } catch (error) {
    console.error('Test failed:', error)
    process.exit(1)
  }

  console.log('\n✅ All tests completed')
  process.exit(0)
}

// Instructions for getting a JWT token
function printAuthInstructions() {
  console.log('\n📋 How to get an Auth0 JWT token for testing:')
  console.log('1. Go to your Auth0 Dashboard')
  console.log('2. Navigate to Applications > APIs > Test')
  console.log('3. Copy the access token')
  console.log(
    '4. Set the environment variable: export TEST_JWT_TOKEN="your-token"',
  )
  console.log('5. Run this test again')
}

// Run the tests when this file is executed directly
if (MOCK_JWT_TOKEN === 'your-jwt-token-here') {
  printAuthInstructions()
}
runTests()
