import { fastify } from 'fastify'
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify'
import { createContextValues } from '@connectrpc/connect'
import Auth0 from '@auth0/auth0-fastify-api'
import itoServiceRoutes from './services/itoService.js'
import { kUser } from './auth/userContext.js'
import dotenv from 'dotenv'

dotenv.config()

// Create the main server function
export const startServer = async () => {
  const connectRpcServer = fastify({
    logger: true,
  })

  // Register the Auth0 plugin
  const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true'

  if (REQUIRE_AUTH) {
    const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
    const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE

    if (!AUTH0_DOMAIN || !AUTH0_AUDIENCE) {
      connectRpcServer.log.error('Auth0 configuration missing in .env file')
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
      console.log('Authentication is ENABLED.')
      fastify.addHook('preHandler', fastify.requireAuth())
    } else {
      console.log('Authentication is DISABLED.')
    }

    // Register the Connect RPC plugin with our service routes
    await fastify.register(fastifyConnectPlugin, {
      routes: itoServiceRoutes,
      contextValues: request => {
        // Pass Auth0 user info from Fastify request to Connect RPC context
        if (REQUIRE_AUTH && request.user && request.user.sub) {
          return createContextValues().set(kUser, request.user)
        }
        return createContextValues()
      },
    })
  })

  connectRpcServer.get('/', async (_, reply) => {
    reply.type('text/plain')
    reply.send('Welcome to the Ito Connect RPC server!')
  })

  // Start the server
  const rpcPort = 3000
  const host = '0.0.0.0'

  try {
    await Promise.all([connectRpcServer.listen({ port: rpcPort, host })])
    console.log(`🚀 Connect RPC server listening on ${host}:${rpcPort}`)
  } catch (err) {
    connectRpcServer.log.error(err)
    process.exit(1)
  }
}
