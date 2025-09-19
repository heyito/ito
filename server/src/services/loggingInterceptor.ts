import type { Interceptor } from '@connectrpc/connect'

export const loggingInterceptor: Interceptor = next => async req => {
  try {
    return await next(req)
  } catch (err) {
    console.error(
      `❌ [${new Date().toISOString()}] RPC failed: ${req.url}`,
      err,
    )
    throw err
  }
}
