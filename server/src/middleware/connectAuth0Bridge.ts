import { ConnectError, Code } from '@connectrpc/connect'
import type { HandlerContext } from '@connectrpc/connect'

// Type definition for the authenticated user from Auth0 Fastify plugin
export interface Auth0User {
  sub: string // User ID
  aud: string | string[] // Audience
  iss: string // Issuer
  iat: number // Issued at
  exp: number // Expires at
  scope?: string // Scopes
  [key: string]: any // Additional claims
}

// Extract the authenticated user from Fastify request context
export const extractAuth0User = (context: HandlerContext): Auth0User => {
  // The Connect RPC Fastify plugin should pass the Fastify request
  // through to the context. We need to access it to get the Auth0 user.
  const request = (context as any).request

  if (!request) {
    throw new ConnectError(
      'Request object not available in Connect RPC context',
      Code.Internal,
    )
  }

  // Check if the user was authenticated by the Auth0 Fastify plugin
  if (!request.user) {
    throw new ConnectError(
      'Authentication required. Please provide a valid Bearer token.',
      Code.Unauthenticated,
    )
  }

  return request.user as Auth0User
}

// Helper function to authenticate Connect RPC calls using Auth0 Fastify plugin
export const authenticateConnectCall = (context: HandlerContext): Auth0User => {
  try {
    return extractAuth0User(context)
  } catch (error) {
    // If it's already a ConnectError, re-throw it
    if (error instanceof ConnectError) {
      throw error
    }

    // Otherwise, wrap it in a ConnectError
    throw new ConnectError('Authentication failed', Code.Unauthenticated)
  }
}

// Helper function to check if user has required scopes
export const requireScopes = (
  user: Auth0User,
  requiredScopes: string[],
): void => {
  if (!requiredScopes || requiredScopes.length === 0) {
    return // No scopes required
  }

  const userScopes = user.scope ? user.scope.split(' ') : []

  const hasAllScopes = requiredScopes.every(scope => userScopes.includes(scope))

  if (!hasAllScopes) {
    throw new ConnectError(
      `Insufficient scope. Required: ${requiredScopes.join(', ')}`,
      Code.PermissionDenied,
    )
  }
}

// Combined function for authentication and scope checking
export const authenticateWithScopes = (
  context: HandlerContext,
  requiredScopes?: string[],
): Auth0User => {
  const user = authenticateConnectCall(context)

  if (requiredScopes) {
    requireScopes(user, requiredScopes)
  }

  return user
}
