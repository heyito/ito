import { describe, test, expect } from 'bun:test'
import { Auth0Connections, RequiredAuth0Fields } from './config'

describe('Auth0 Configuration', () => {
  describe('required fields', () => {
    test('documents required Auth0 environment variables', () => {
      expect(RequiredAuth0Fields).toHaveLength(4)
      expect(RequiredAuth0Fields).toContain('domain')
      expect(RequiredAuth0Fields).toContain('clientId')
      expect(RequiredAuth0Fields).toContain('redirectUri')
      expect(RequiredAuth0Fields).toContain('audience')
    })
  })

  describe('Auth0Connections', () => {
    test('provides correct social provider connection identifiers', () => {
      // These mappings are business-critical - Auth0 expects these exact strings
      expect(Auth0Connections.google).toBe('google-oauth2')
      expect(Auth0Connections.microsoft).toBe('windowslive')
      expect(Auth0Connections.apple).toBe('apple')
      expect(Auth0Connections.github).toBe('github')
    })
  })
})
