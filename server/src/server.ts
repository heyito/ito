import { fastify } from 'fastify'
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify'
import Auth0 from '@auth0/auth0-fastify-api'
import itoServiceRoutes from './services/itoService.js'
import dotenv from 'dotenv'
import { groqClient } from './clients/groqClient.js'
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'

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

  // Initialize groq client
  const groqApiKey = await getGroqApiKey()
  const asrModel = process.env.GROQ_TRANSCRIPTION_MODEL
  if (!groqApiKey || !asrModel) {
    console.error(
      'FATAL: Groq api key or Groq transcription model is not set. The application cannot start.',
    )
    process.exit(1)
  }

  // Note: userCommandModel is empty for now as we are only using transcription.
  await groqClient.initialize(groqApiKey, '', asrModel)

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

async function getGroqApiKey(): Promise<string | undefined> {
  const apiKey = process.env.GROQ_API_KEY
  if (apiKey) {
    return apiKey
  }

  // If the API key is not set in the environment (local development), try to fetch it from AWS Secrets Manager.
  const client = new SecretsManagerClient()
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId:
        'arn:aws:secretsmanager:us-west-2:287641434880:secret:groq-api-key-Hf2m1I',
    }),
  )

  return response.SecretString
}
