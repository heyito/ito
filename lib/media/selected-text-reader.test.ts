import { describe, test, expect, beforeAll } from 'bun:test'
import { getSelectedText, getSelectedTextString, hasSelectedText } from './selected-text-reader'
import { existsSync } from 'fs'
import { getNativeBinaryPath } from './native-interface'

describe('Selected Text Reader', () => {
  const binaryPath = getNativeBinaryPath('selected-text-reader')

  beforeAll(() => {
    // Skip tests if binary doesn't exist (e.g., not built yet)
    if (!binaryPath || !existsSync(binaryPath)) {
      console.warn('Selected text reader binary not found, skipping tests')
    }
  })

  test('should return binary path', () => {
    expect(binaryPath).toBeDefined()
    if (binaryPath) {
      expect(typeof binaryPath).toBe('string')
      expect(binaryPath).toContain('selected-text-reader')
    }
  })

  test('should handle no selected text gracefully', async () => {
    if (!binaryPath || !existsSync(binaryPath)) {
      return // Skip test if binary not available
    }

    const result = await getSelectedText({ format: 'json' })
    expect(result).toBeDefined()
    expect(result.success).toBeDefined()
    expect(typeof result.success).toBe('boolean')
    expect(result.length).toBeDefined()
    expect(typeof result.length).toBe('number')
  })

  test('should handle text format', async () => {
    if (!binaryPath || !existsSync(binaryPath)) {
      return // Skip test if binary not available
    }

    const result = await getSelectedText({ format: 'text' })
    expect(result).toBeDefined()
    expect(result.success).toBeDefined()
    expect(typeof result.success).toBe('boolean')
  })

  test('should respect max length option', async () => {
    if (!binaryPath || !existsSync(binaryPath)) {
      return // Skip test if binary not available
    }

    const result = await getSelectedText({ format: 'json', maxLength: 10 })
    expect(result).toBeDefined()
    expect(result.success).toBeDefined()
    
    // If text is found, it should not exceed max length
    if (result.text) {
      expect(result.text.length).toBeLessThanOrEqual(10)
    }
  })

  test('getSelectedTextString should return string or null', async () => {
    if (!binaryPath || !existsSync(binaryPath)) {
      return // Skip test if binary not available
    }

    const result = await getSelectedTextString()
    expect(result === null || typeof result === 'string').toBe(true)
  })

  test('hasSelectedText should return boolean', async () => {
    if (!binaryPath || !existsSync(binaryPath)) {
      return // Skip test if binary not available
    }

    const result = await hasSelectedText()
    expect(typeof result).toBe('boolean')
  })

  test('should handle invalid format gracefully', async () => {
    if (!binaryPath || !existsSync(binaryPath)) {
      return // Skip test if binary not available
    }

    const result = await getSelectedText({ format: 'invalid' as any })
    expect(result).toBeDefined()
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})