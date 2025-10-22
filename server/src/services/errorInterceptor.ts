import type { Interceptor } from '@connectrpc/connect'
import { ConnectError, Code } from '@connectrpc/connect'

export const errorInterceptor: Interceptor = next => async req => {
  try {
    return await next(req)
  } catch (err) {
    // If it's already a ConnectError, just re-throw it (logging happens in loggingInterceptor)
    if (err instanceof ConnectError) {
      throw err
    }

    // Log non-ConnectError errors
    console.error('Unhandled error in RPC handler:', err)

    // Check if this is a connection abort/reset error (client cancelled)
    const isAbortError =
      err instanceof Error &&
      (err.message === 'aborted' ||
        (err as any).code === 'ECONNRESET' ||
        (err as any).code === 'ABORT_ERR')

    if (isAbortError) {
      console.log('Request cancelled by client (connection closed)')
      throw new ConnectError(
        'Request cancelled by client',
        Code.Canceled,
        undefined,
        undefined,
        err,
      )
    }

    // Otherwise, wrap in a ConnectError
    throw new ConnectError(
      'Internal server error',
      Code.Internal,
      undefined,
      undefined,
      err,
    )
  }
}
