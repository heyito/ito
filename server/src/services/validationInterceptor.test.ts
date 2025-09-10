import { describe, it, expect, mock } from 'bun:test'
import { ConnectError } from '@connectrpc/connect'
import { createValidator } from '@bufbuild/protovalidate'
import { createValidationInterceptor } from './validationInterceptor.js'
import {
  AudioChunkSchema,
  CreateNoteRequestSchema,
} from '../generated/ito_pb.js'
import { create } from '@bufbuild/protobuf'

describe('ValidationInterceptor', () => {
  const interceptor = createValidationInterceptor()

  describe('unary request validation', () => {
    it('should pass valid unary requests through', async () => {
      const validRequest = create(CreateNoteRequestSchema, {
        id: 'test-id',
        interactionId: 'interaction-id',
        content: 'Test note content',
      })

      const mockNext = mock(() => Promise.resolve({ message: 'success' }))
      const mockReq = {
        method: {
          kind: 'unary' as const,
          input: CreateNoteRequestSchema,
        },
        message: validRequest,
      }

      const result = await interceptor(mockNext)(mockReq as any)

      expect(mockNext).toHaveBeenCalledWith(mockReq)
      expect(result).toEqual({ message: 'success' })
    })

    it('should pass through requests without validation rules', async () => {
      // Create a request with empty fields (no validation rules for strings)
      const request = create(CreateNoteRequestSchema, {
        id: '',
        interactionId: '',
        content: '',
      })

      const mockNext = mock(() => Promise.resolve({ message: 'success' }))
      const mockReq = {
        method: {
          kind: 'unary' as const,
          input: CreateNoteRequestSchema,
        },
        message: request,
      }

      const result = await interceptor(mockNext)(mockReq as any)
      expect(result).toEqual({ message: 'success' })
    })
  })

  describe('streaming request validation', () => {
    it('should pass valid audio chunks through', async () => {
      const validChunk = create(AudioChunkSchema, {
        audioData: new Uint8Array(100 * 1024), // 100KB - under 1MB limit
      })

      async function* validStream() {
        yield validChunk
      }

      const mockNext = mock(() => Promise.resolve({ message: 'success' }))
      const mockReq = {
        method: {
          kind: 'client_streaming' as const,
          input: AudioChunkSchema,
        },
        message: validStream(),
      }

      const result = await interceptor(mockNext)(mockReq as any)

      expect(mockNext).toHaveBeenCalledWith(mockReq)
      expect(result).toEqual({ message: 'success' })
    })

    it('should validate audio chunk size with protovalidate', () => {
      const validator = createValidator()

      // Test valid chunk (under 1MB limit)
      const validChunk = create(AudioChunkSchema, {
        audioData: new Uint8Array(100 * 1024), // 100KB
      })

      const validResult = validator.validate(AudioChunkSchema, validChunk)
      expect(validResult.kind).toBe('valid')
      expect(validResult.violations).toBeUndefined()

      // Test invalid chunk (over 1MB limit)
      const invalidChunk = create(AudioChunkSchema, {
        audioData: new Uint8Array(2 * 1024 * 1024), // 2MB - exceeds 1MB limit
      })

      const invalidResult = validator.validate(AudioChunkSchema, invalidChunk)
      expect(invalidResult.kind).toBe('invalid')
      expect(invalidResult.violations).toBeDefined()
      expect(invalidResult.violations.length).toBe(1)
      expect(invalidResult.violations[0].message).toContain(
        'value must be at most 1048576 bytes',
      )
    })

    it('should reject oversized audio chunks in interceptor', async () => {
      const oversizedChunk = create(AudioChunkSchema, {
        audioData: new Uint8Array(2 * 1024 * 1024), // 2MB - exceeds 1MB limit
      })

      async function* invalidStream() {
        yield oversizedChunk
      }

      const mockNext = mock(() => Promise.resolve({ message: 'success' }))
      const mockReq = {
        method: {
          kind: 'client_streaming' as const,
          input: AudioChunkSchema,
        },
        message: invalidStream(),
      }

      // The interceptor modifies the stream but doesn't consume it
      // We need to manually consume the modified stream to trigger validation
      const modifiedReq = { ...mockReq }

      // Call the interceptor which will modify the message stream
      await interceptor(mockNext)(modifiedReq as any)

      // Now consume the modified stream to trigger validation
      let errorThrown = false
      try {
        for await (const _chunk of modifiedReq.message) {
          // This should throw during validation
        }
      } catch (error) {
        errorThrown = true
        expect(error).toBeInstanceOf(ConnectError)
        expect(error.message).toContain('Streaming validation failed')
      }
      expect(errorThrown).toBe(true)
    })

    it('should accept chunks exactly at the limit', async () => {
      const limitChunk = create(AudioChunkSchema, {
        audioData: new Uint8Array(1024 * 1024), // Exactly 1MB
      })

      async function* limitStream() {
        yield limitChunk
      }

      const mockNext = mock(() => Promise.resolve({ message: 'success' }))
      const mockReq = {
        method: {
          kind: 'client_streaming' as const,
          input: AudioChunkSchema,
        },
        message: limitStream(),
      }

      const result = await interceptor(mockNext)(mockReq as any)

      expect(mockNext).toHaveBeenCalledWith(mockReq)
      expect(result).toEqual({ message: 'success' })
    })
  })

  describe('validation error handling', () => {
    it('should handle validation library errors gracefully', async () => {
      const mockNext = mock(() => Promise.resolve({ message: 'success' }))
      const mockReq = {
        method: {
          kind: 'unary' as const,
          input: { invalid: 'schema' }, // Invalid schema object
        },
        message: {},
      }

      // Should not throw even if validation fails internally
      const result = await interceptor(mockNext)(mockReq as any)
      expect(result).toEqual({ message: 'success' })
    })
  })

  describe('non-validatable requests', () => {
    it('should pass through server streaming requests without validation', async () => {
      const mockNext = mock(() => Promise.resolve({ message: 'success' }))
      const mockReq = {
        method: {
          kind: 'server_streaming' as const,
          input: CreateNoteRequestSchema,
        },
        message: {},
      }

      const result = await interceptor(mockNext)(mockReq as any)

      expect(mockNext).toHaveBeenCalledWith(mockReq)
      expect(result).toEqual({ message: 'success' })
    })

    it('should pass through bidirectional streaming requests without validation', async () => {
      const mockNext = mock(() => Promise.resolve({ message: 'success' }))
      const mockReq = {
        method: {
          kind: 'bidi_streaming' as const,
          input: CreateNoteRequestSchema,
        },
        message: {},
      }

      const result = await interceptor(mockNext)(mockReq as any)

      expect(mockNext).toHaveBeenCalledWith(mockReq)
      expect(result).toEqual({ message: 'success' })
    })
  })
})
