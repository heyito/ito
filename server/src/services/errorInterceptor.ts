import type { Interceptor } from '@connectrpc/connect'
import { ConnectError, Code } from '@connectrpc/connect'
import { isAbortError, createAbortError } from '../utils/abortUtils.js'

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
    if (isAbortError(err)) {
      console.log('Request cancelled by client (connection closed)')
      throw createAbortError(err)
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
