import { createContextKey } from '@connectrpc/connect'
import type { Auth0User } from './connectAuth0Bridge.js'

/**
 * A type-safe key for storing the authenticated Auth0 user in the Connect RPC context.
 * This is populated by the authInterceptor on the server.
 */
export const userContextKey = createContextKey<Auth0User | undefined>(undefined) 