import type { Interceptor } from '@connectrpc/connect'
import { ConnectError, Code } from '@connectrpc/connect'

export const errorInterceptor: Interceptor = (next) => async (req) => {
  try {
    return await next(req)
  } catch (err) {
    console.error('Unhandled error in RPC handler:', err)
    
    // If it's already a ConnectError, just re-throw it
    if (err instanceof ConnectError) {
      throw err
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