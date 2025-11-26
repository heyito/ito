import type { FastifyRequest } from 'fastify'

/**
 * Extracts the user ID from a Fastify request.
 * In production (requireAuth=true), returns the authenticated user's sub from JWT.
 * In dev mode (requireAuth=false), returns 'self-hosted' as a default user ID.
 *
 * @param request - The Fastify request object
 * @param requireAuth - Whether authentication is required (from REQUIRE_AUTH env var)
 * @returns The user ID, or undefined if not authenticated and auth is required
 */
export function getUserIdFromRequest(
  request: FastifyRequest,
  requireAuth: boolean,
): string | undefined {
  // Try to get authenticated user ID from JWT
  const authenticatedUserId = (request as any).user?.sub

  if (authenticatedUserId) {
    return authenticatedUserId
  }

  // In dev mode (auth disabled), use 'self-hosted' as default user
  if (!requireAuth) {
    return 'self-hosted'
  }

  // Auth required but no user found
  return undefined
}
