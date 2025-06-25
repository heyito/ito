import { fastify } from 'fastify'
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify'
import Auth0 from '@auth0/auth0-fastify-api'
import itoServiceRoutes from './services/itoService.js'
import dotenv from 'dotenv'

dotenv.config()

// Create the main server function
export const startServer = async () => {
  const server = fastify({
    logger: true,
  })

  // Validate Auth0 configuration
  if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_AUDIENCE) {
    server.log.error('Auth0 domain or audience not configured in .env file')
    process.exit(1)
  }

  // Register the Auth0 plugin
  const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true'
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
  const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE
  if (REQUIRE_AUTH && (!AUTH0_DOMAIN || !AUTH0_AUDIENCE)) {
    server.log.error('Auth0 domain or audience not configured in .env file')
    process.exit(1)
  }

  await server.register(Auth0, {
    domain: process.env.AUTH0_DOMAIN,
    audience: process.env.AUTH0_AUDIENCE,
  })

  // Register Connect RPC plugin in a context that conditionally applies Auth0 authentication
  await server.register(async function (fastify) {
    // Apply Auth0 authentication to all routes in this context only if REQUIRE_AUTH is true
    if (REQUIRE_AUTH) {
      fastify.addHook('preHandler', fastify.requireAuth())
    }

    // Register the Connect RPC plugin with our service routes
    await fastify.register(fastifyConnectPlugin, {
      routes: itoServiceRoutes,
    })
  })

  // Health check endpoint (public)
  server.get('/health', async (_request, _reply) => {
    return { status: 'ok', service: 'ito-server' }
  })

  // Start the server
  const port = 3000
  const host = '0.0.0.0'

  try {
    await server.listen({ port, host })
    console.log(`🚀 Connect RPC server listening on ${host}:${port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}
