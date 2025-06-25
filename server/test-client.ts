import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-node'
import {
  ItoService,
  TranscribeFileRequestSchema,
} from './src/generated/ito_pb.js'
import { create } from '@bufbuild/protobuf'

// Mock JWT token for testing (replace with actual Auth0 token)
const TEST_JWT_TOKEN = process.env.TEST_JWT_TOKEN || 'your-jwt-token-here'

const transport = createConnectTransport({
  baseUrl: 'http://localhost:3000',
  httpVersion: '1.1', // Use HTTP/1.1 for simplicity
})

const client = createClient(ItoService, transport)

// Create headers with Auth0 JWT token
const createAuthHeaders = (token: string) => {
  return { authorization: `Bearer ${token}` }
}

// Test the TranscribeFile method with authentication
async function testTranscribeFile() {
  console.log('Testing TranscribeFile with Auth0 authentication...')

  const audioData = new TextEncoder().encode('fake-audio-data')
  const request = create(TranscribeFileRequestSchema, {
    audioData: audioData,
  })
  const headers = createAuthHeaders(TEST_JWT_TOKEN)

  try {
    const response = await client.transcribeFile(request, { headers })
    console.log('✓ TranscribeFile response:', response)
    return response
  } catch (error) {
    console.error('✗ TranscribeFile error:', error)
    throw error
  }
}

// Test the public health endpoint using fetch
async function testHealthEndpoint() {
  console.log('Testing public HTTP health endpoint...')

  try {
    const response = await fetch('http://localhost:3000/health')
    const data = await response.json()
    console.log('✓ Public health endpoint response:', data)
    return data
  } catch (error) {
    console.error('✗ Health endpoint test error:', error)
    throw error
  }
}

// Main test function
async function runTests() {
  console.log('='.repeat(70))
  console.log('🧪 Connect RPC + Auth0 Fastify Integration Test')
  console.log('='.repeat(70))

  try {
    console.log('TEST_JWT_TOKEN', TEST_JWT_TOKEN)

    // Test HTTP endpoints first
    console.log('\n📡 Testing HTTP Endpoints:')
    await testHealthEndpoint()

    if (TEST_JWT_TOKEN !== 'your-jwt-token-here') {
      console.log('\n🚀 Testing Authenticated Connect RPC calls:')
      await testTranscribeFile()
      console.log('✓ TranscribeFile with Auth0 authentication working')

      console.log('\n🎉 All tests with authentication passed!')
    } else {
      console.log(
        '\n⚠️  To test authenticated RPC calls, set TEST_JWT_TOKEN environment variable',
      )
      console.log('   Get a token from your Auth0 application and run:')
      console.log('   export TEST_JWT_TOKEN="your-actual-jwt-token"')
      console.log('   npm run test-connect')
    }

    console.log('\n✅ All tests completed successfully!')
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }

  process.exit(0)
}

runTests()
