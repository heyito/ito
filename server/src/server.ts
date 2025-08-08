import { fastify } from 'fastify'
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify'
import { createContextValues } from '@connectrpc/connect'
import Auth0 from '@auth0/auth0-fastify-api'
import itoServiceRoutes from './services/ito/itoService.js'
import { kUser } from './auth/userContext.js'
import { errorInterceptor } from './services/errorInterceptor.js'
import { loggingInterceptor } from './services/loggingInterceptor.js'
import { createValidationInterceptor } from './services/validationInterceptor.js'
import { renderCallbackPage } from './utils/renderCallback.js'
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
    const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID
    const AUTH0_CALLBACK_URL = process.env.AUTH0_CALLBACK_URL

    if (
      !AUTH0_DOMAIN ||
      !AUTH0_AUDIENCE ||
      !AUTH0_CLIENT_ID ||
      !AUTH0_CALLBACK_URL
    ) {
      connectRpcServer.log.error('Auth0 configuration missing in .env file')
      process.exit(1)
    }

    await connectRpcServer.register(Auth0, {
      domain: AUTH0_DOMAIN,
      audience: AUTH0_AUDIENCE,
    })

    connectRpcServer.get('/login', async (request, reply) => {
      const { state } = request.query as { state?: string }

      if (!state || typeof state !== 'string') {
        reply.status(400).send('Missing or invalid state parameter')
        return
      }

      const redirectUrl = new URL(`https://${AUTH0_DOMAIN}/authorize`)
      redirectUrl.searchParams.set('response_type', 'code')
      redirectUrl.searchParams.set('client_id', AUTH0_CLIENT_ID)
      redirectUrl.searchParams.set('redirect_uri', AUTH0_CALLBACK_URL)
      redirectUrl.searchParams.set(
        'scope',
        'openid profile email offline_access',
      )
      redirectUrl.searchParams.set('state', state)

      reply.redirect(redirectUrl.toString(), 302)
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

    // Register the Connect RPC plugin with our service routes and interceptors
    await fastify.register(fastifyConnectPlugin, {
      routes: itoServiceRoutes,
      // Order matters: logging -> validation -> error handling
      interceptors: [
        loggingInterceptor,
        createValidationInterceptor(),
        errorInterceptor,
      ],
      contextValues: request => {
        // Pass Auth0 user info from Fastify request to Connect RPC context
        if (REQUIRE_AUTH && request.user && request.user.sub) {
          return createContextValues().set(kUser, request.user)
        }
        return createContextValues()
      },
    })
  })

  // Error handling - this handles Fastify-level errors, not RPC errors
  connectRpcServer.setErrorHandler((error, _, reply) => {
    connectRpcServer.log.error(error)
    reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    })
  })

  // Basic REST route for health check
  connectRpcServer.get('/', async (_, reply) => {
    reply.type('text/plain')
    reply.send('Welcome to the Ito Connect RPC server!')
  })

  // Callback endpoint (alternative route for same functionality)
  connectRpcServer.get('/callback', async (request, reply) => {
    const { code, state } = request.query as {
      code: string
      state: string
    }

    const html = renderCallbackPage({ code, state })

    reply.type('text/html')
    reply.send(html)
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
