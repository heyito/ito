import type { Interceptor } from '@connectrpc/connect'

export const loggingInterceptor: Interceptor = (next) => async (req) => {
  const start = Date.now()
  console.log(`📩 [${new Date().toISOString()}] RPC call: ${req.url}`)
  
  try {
    const res = await next(req)
    const duration = Date.now() - start
    
    if (!res.stream) {
      console.log(`✅ [${new Date().toISOString()}] RPC completed: ${req.url} (${duration}ms)`)
    } else {
      console.log(`🌊 [${new Date().toISOString()}] RPC stream started: ${req.url} (${duration}ms)`)
    }
    
    return res
  } catch (err) {
    const duration = Date.now() - start
    console.log(`❌ [${new Date().toISOString()}] RPC failed: ${req.url} (${duration}ms)`)
    throw err
  }
} 