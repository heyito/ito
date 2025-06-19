import dotenv from 'dotenv'
import * as grpc from '@grpc/grpc-js'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

dotenv.config()

// Auth0 configuration
export const Auth0Config = {
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_CLIENT_ID,
  audience: process.env.AUTH0_AUDIENCE,
  scope: 'openid profile email',
}

// Create JWKS client for Auth0
const client = jwksClient({
  jwksUri: `https://${Auth0Config.domain}/.well-known/jwks.json`,
  requestHeaders: {}, // Optional
  timeout: 30000, // Defaults to 30s
  rateLimit: true,
  jwksRequestsPerMinute: 5,
})

// Function to get the signing key
const getKey = (header: any, callback: any) => {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err)
    }
    const signingKey = key?.getPublicKey()
    callback(null, signingKey)
  })
}

// Extract token from gRPC metadata
export const extractTokenFromMetadata = (
  metadata: grpc.Metadata,
): string | null => {
  const authHeader = metadata.get('authorization')[0] as string

  if (!authHeader) {
    return null
  }

  // Check for Bearer token format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  return authHeader
}

// Validate JWT token for gRPC calls
export const validateGrpcAuth = async (
  metadata: grpc.Metadata,
): Promise<{ isValid: boolean; user?: any; error?: string }> => {
  try {
    const token = extractTokenFromMetadata(metadata)

    if (!token) {
      console.warn('No authorization token provided')
      return {
        isValid: false,
        error: 'No authorization token provided',
      }
    }

    // Verify the token
    return new Promise(resolve => {
      jwt.verify(
        token,
        getKey,
        {
          audience: Auth0Config.audience,
          issuer: `https://${Auth0Config.domain}/`,
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err) {
            resolve({
              isValid: false,
              error: err.message || 'Invalid token',
            })
          } else {
            resolve({
              isValid: true,
              user: decoded,
            })
          }
        },
      )
    })
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Authentication error',
    }
  }
}

// Helper function to authenticate and handle errors in gRPC handlers
export const authenticateCall = async (
  call: any,
  callback: any,
): Promise<{ user: any } | null> => {
  const authResult = await validateGrpcAuth(call.metadata)

  if (!authResult.isValid) {
    callback({
      code: grpc.status.UNAUTHENTICATED,
      details: authResult.error || 'Authentication failed',
    })
    return null
  }

  return { user: authResult.user }
}
