import { fastify } from 'fastify'
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify'
import Auth0 from '@auth0/auth0-fastify-api'
import itoServiceRoutes from './services/itoService.js'
import dotenv from 'dotenv'

dotenv.config()

// Create the main server function
export const startServer = async () => {
  const connectRpcServer = fastify({
    logger: true,
    http2: true, // Enable HTTP/2 support
  })

  // Register the Auth0 plugin
  const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true'

  if (REQUIRE_AUTH) {
    const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
    const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE

    if (!AUTH0_DOMAIN || !AUTH0_AUDIENCE) {
      connectRpcServer.log.error(
        'Auth0 client ID or secret not configured in .env file',
      )
      process.exit(1)
    }

    await connectRpcServer.register(Auth0, {
      domain: AUTH0_DOMAIN,
      audience: AUTH0_AUDIENCE,
    })
  }

  // Register Connect RPC plugin in a context that conditionally applies Auth0 authentication
  await connectRpcServer.register(async function (fastify) {
    // Apply Auth0 authentication to all routes in this context only if REQUIRE_AUTH is true
    if (REQUIRE_AUTH) {
      fastify.addHook('preHandler', fastify.requireAuth())
    }

    // Register the Connect RPC plugin with our service routes
    await fastify.register(fastifyConnectPlugin, {
      routes: itoServiceRoutes,
    })
  })

  const healthServer = fastify({ logger: false }) // A standard, lightweight HTTP/1.1 server

  // This simple route has no plugins or dependencies
  healthServer.get('/health', async (_request, _reply) => {
    return { status: 'ok', service: 'ito-server' }
  })

  // Start the server
  const rpcPort = 3000
  const healthPort = 3001
  const host = '0.0.0.0'

  try {
    await Promise.all([
      connectRpcServer.listen({ port: rpcPort, host }),
      healthServer.listen({ port: healthPort, host }),
    ])
    console.log(`🚀 Connect RPC server listening on ${host}:${rpcPort}`)
  } catch (err) {
    connectRpcServer.log.error(err)
    process.exit(1)
  }
}
