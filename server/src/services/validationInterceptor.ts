import { Interceptor } from '@connectrpc/connect'
import { createValidator } from '@bufbuild/protovalidate'
import { ConnectError, Code } from '@connectrpc/connect'

export function createValidationInterceptor(): Interceptor {
  const validator = createValidator()

  return next => async req => {
    if (req.method.kind === 'unary') {
      // Validate unary requests
      try {
        const result = validator.validate(req.method.input, req.message)

        if (result.kind === 'invalid') {
          const errors =
            result.violations
              ?.map(v => `${v.field?.map(f => f.name).join('.')}: ${v.message}`)
              .join(', ') || 'Validation failed'

          throw new ConnectError(
            `Validation failed: ${errors}`,
            Code.InvalidArgument,
          )
        }
      } catch (error) {
        if (error instanceof ConnectError) {
          throw error
        }
        console.error('Validation error:', error)
      }
    } else if (req.method.kind === 'client_streaming') {
      // Validate streaming requests (like TranscribeStream with AudioChunk)
      const originalStream = req.message

      // Create a new async iterator that validates each chunk
      req.message = (async function* () {
        for await (const chunk of originalStream) {
          try {
            const result = validator.validate(req.method.input, chunk)

            if (result.kind === 'invalid') {
              const errors =
                result.violations
                  ?.map(
                    v => `${v.field?.map(f => f.name).join('.')}: ${v.message}`,
                  )
                  .join(', ') || 'Validation failed'

              throw new ConnectError(
                `Streaming validation failed: ${errors}`,
                Code.InvalidArgument,
              )
            }

            yield chunk
          } catch (error) {
            if (error instanceof ConnectError) {
              throw error
            }
            console.error('Streaming validation error:', error)
            yield chunk // Continue with unvalidated chunk if validation itself fails
          }
        }
      })()
    }

    return await next(req)
  }
}
