import type { Interceptor } from '@connectrpc/connect'
import { ConnectError, Code } from '@connectrpc/connect'

export const loggingInterceptor: Interceptor = next => async req => {
  try {
    return await next(req)
  } catch (err) {
    // Don't throw cancellations as errors - they're expected
    if (err instanceof ConnectError && err.code === Code.Canceled) {
      console.log(`🚫 [${new Date().toISOString()}] RPC cancelled: ${req.url}`)
    } else {
      console.error(
        `❌ [${new Date().toISOString()}] RPC failed: ${req.url}`,
        err,
      )
    }
    throw err
  }
}
