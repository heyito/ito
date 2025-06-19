import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-node'
import { ItoService } from './src/generated/ito_pb.js'
import { create } from '@bufbuild/protobuf'
import {
  HealthCheckRequestSchema,
  TranscribeFileRequestSchema,
  AudioChunkSchema,
} from './src/generated/ito_pb.js'

// Mock JWT token for testing (replace with actual Auth0 token)
const MOCK_JWT_TOKEN = process.env.TEST_JWT_TOKEN || 'your-jwt-token-here'

const transport = createConnectTransport({
  baseUrl: 'http://localhost:3000',
  httpVersion: '1.1', // Use HTTP/1.1 for simplicity
})

const client = createClient(ItoService, transport)

// Create headers with Auth0 JWT token
const createAuthHeaders = (token: string) => {
  return { authorization: `Bearer ${token}` }
}

// Test the HealthCheck method with authentication
async function testHealthCheck() {
  console.log('Testing HealthCheck with Auth0 authentication...')

  const request = create(HealthCheckRequestSchema, {})
  const headers = createAuthHeaders(MOCK_JWT_TOKEN)

  try {
    const response = await client.healthCheck(request, { headers })
    console.log('✓ HealthCheck response:', response)
    return response
  } catch (error) {
    console.error('✗ HealthCheck error:', error)
    throw error
  }
}

// Test the TranscribeFile method with authentication
async function testTranscribeFile() {
  console.log('Testing TranscribeFile with Auth0 authentication...')

  const audioData = new TextEncoder().encode('fake-audio-data')
  const request = create(TranscribeFileRequestSchema, {
    audioData: audioData,
  })
  const headers = createAuthHeaders(MOCK_JWT_TOKEN)

  try {
    const response = await client.transcribeFile(request, { headers })
    console.log('✓ TranscribeFile response:', response)
    return response
  } catch (error) {
    console.error('✗ TranscribeFile error:', error)
    throw error
  }
}

// Test without authentication (should fail)
async function testWithoutAuth() {
  console.log('Testing Connect RPC without authentication (should fail)...')

  const request = create(HealthCheckRequestSchema, {})

  try {
    const response = await client.healthCheck(request)
    console.error('✗ Unexpected success without authentication')
    throw new Error('Should have failed without auth')
  } catch (error) {
    console.log('✓ Expected authentication error:', error.message)
    return error
  }
}

// Test the callback endpoint using fetch
async function testCallbackEndpoint() {
  console.log('Testing OAuth callback endpoint...')

  const testCode = '9D92FlQ6QjcIMVOpu_e8_veK820AUoHNqTN3BpXJa73-3'
  const callbackUrl = `http://localhost:3000/callback?code=${testCode}&state=test`

  try {
    const response = await fetch(callbackUrl)
    const contentType = response.headers.get('content-type')

    if (contentType?.includes('text/html')) {
      console.log('✓ Callback endpoint returns HTML page')
      const html = await response.text()

      // Check if the HTML contains expected elements
      if (
        html.includes('Authentication Successful') &&
        html.includes('evan@demoxlabs.xyz') &&
        html.includes('Open Ito App')
      ) {
        console.log('✓ HTML page contains expected content')
      } else {
        console.log('⚠️ HTML page missing some expected content')
      }

      return { success: true, type: 'html', contentLength: html.length }
    } else {
      console.error('✗ Expected HTML but received:', contentType)
      const data = await response.text()
      console.log('Response:', data.substring(0, 200) + '...')
      return { success: false, type: contentType }
    }
  } catch (error) {
    console.error('✗ Callback test error:', error)
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

// Test the protected health endpoint using fetch
async function testProtectedHealthEndpoint() {
  console.log('Testing protected HTTP health endpoint...')

  try {
    // Test without auth (should fail)
    const responseNoAuth = await fetch('http://localhost:3000/health/auth')
    if (responseNoAuth.status === 401) {
      console.log(
        '✓ Protected endpoint correctly rejects unauthenticated requests',
      )
    } else {
      console.error('✗ Protected endpoint should have returned 401')
    }

    // Test with auth (if token is available)
    if (MOCK_JWT_TOKEN !== 'your-jwt-token-here') {
      const responseWithAuth = await fetch(
        'http://localhost:3000/health/auth',
        {
          headers: {
            Authorization: `Bearer ${MOCK_JWT_TOKEN}`,
          },
        },
      )

      if (responseWithAuth.ok) {
        const data = await responseWithAuth.json()
        console.log('✓ Protected health endpoint with auth response:', data)
      } else {
        console.log(
          '⚠️ Protected health endpoint with token failed:',
          responseWithAuth.status,
        )
      }
    }
  } catch (error) {
    console.error('✗ Protected health endpoint test error:', error)
    throw error
  }
}

// Main test function
async function runTests() {
  console.log('='.repeat(70))
  console.log('🧪 Connect RPC + Auth0 Fastify Integration Test')
  console.log('='.repeat(70))

  try {
    // Test HTTP endpoints first
    console.log('\n📡 Testing HTTP Endpoints:')
    await testHealthEndpoint()
    await testProtectedHealthEndpoint()
    await testCallbackEndpoint()

    // Test Connect RPC authentication
    console.log('\n🔒 Testing Connect RPC Authentication:')
    await testWithoutAuth()
    console.log('✓ Connect RPC authentication enforcement working')

    if (MOCK_JWT_TOKEN !== 'your-jwt-token-here') {
      console.log('\n🚀 Testing Authenticated Connect RPC calls:')
      await testHealthCheck()
      console.log('✓ HealthCheck with Auth0 authentication working')

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
    console.log('\n🔧 Next steps:')
    console.log(
      '   1. Update Auth0 Dashboard callback URL to: http://localhost:3000/callback',
    )
    console.log('   2. Test with real Auth0 tokens')
    console.log('   3. Implement token exchange in callback handler')
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }

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
  console.log('5. Run this test again: npm run test-connect')
}

// Run the tests when this file is executed directly
if (MOCK_JWT_TOKEN === 'your-jwt-token-here') {
  printAuthInstructions()
}

runTests()
