import { createContextKey } from '@connectrpc/connect'

// Auth0 user type based on the user object structure
export interface Auth0User {
  sub?: string
  [key: string]: any
}

// Create a type-safe context key for the authenticated user
export const kUser = createContextKey<Auth0User | undefined>(undefined, {
  description: 'Authenticated Auth0 user',
})
