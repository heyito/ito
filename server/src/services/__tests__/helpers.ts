import type { FastifyInstance } from 'fastify'
import { fastify } from 'fastify'

export type AnyObject = Record<string, any>

export function createTestApp(): FastifyInstance {
  return fastify()
}

export function addAuthHook(
  app: FastifyInstance,
  userSub: string = 'user-123',
): void {
  app.addHook('preHandler', async req => {
    ;(req as any).user = { sub: userSub }
  })
}

export function createTestAppWithAuth(
  userSub: string = 'user-123',
): FastifyInstance {
  const app = createTestApp()
  addAuthHook(app, userSub)
  return app
}

export function createEnvReset() {
  const originalEnv = process.env

  return {
    originalEnv,
    reset: () => {
      process.env = originalEnv
    },
    set: (env: Record<string, string | undefined>) => {
      process.env = {
        ...originalEnv,
        ...env,
      }
    },
  }
}
