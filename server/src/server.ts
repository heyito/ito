import { fastify } from 'fastify'
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify'
import Auth0 from '@auth0/auth0-fastify-api'
import itoServiceRoutes from './services/itoService.js'
import dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read the HTML template
const callbackTemplate = readFileSync(
  join(__dirname, 'templates/callbackSuccess.html'),
  'utf-8',
)

// Simple template rendering function
const renderTemplate = (
  template: string,
  variables: Record<string, string>,
) => {
  let rendered = template
  for (const [key, value] of Object.entries(variables)) {
    // Handle both {{variable}} and {{#variable}}...{{/variable}} patterns
    const simplePattern = new RegExp(`{{${key}}}`, 'g')
    const conditionalPattern = new RegExp(
      `{{#${key}}}([\\s\\S]*?){{/${key}}}`,
      'g',
    )

    rendered = rendered.replace(simplePattern, value)

    // For conditional blocks, show content if value exists, hide if empty
    rendered = rendered.replace(conditionalPattern, (match, content) => {
      return value ? content.replace(`{{${key}}}`, value) : ''
    })
  }

  // Clean up any remaining template variables
  rendered = rendered.replace(/{{[^}]+}}/g, '')

  return rendered
}

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
  await server.register(Auth0, {
    domain: process.env.AUTH0_DOMAIN,
    audience: process.env.AUTH0_AUDIENCE,
  })

  // Register Connect RPC plugin in a context that applies Auth0 authentication
  await server.register(async function (fastify) {
    // Apply Auth0 authentication to all routes in this context
    fastify.addHook('preHandler', fastify.requireAuth())

    // Register the Connect RPC plugin with our service routes
    await fastify.register(fastifyConnectPlugin, {
      routes: itoServiceRoutes,
    })
  })

  // Regular HTTP endpoints
  // Health check endpoint (public)
  server.get('/health', async (request, reply) => {
    return { status: 'ok', service: 'ito-server' }
  })

  // Protected health check endpoint using Auth0
  server.get(
    '/health/auth',
    {
      preHandler: server.requireAuth(),
    },
    async (request, reply) => {
      return {
        status: 'ok',
        service: 'ito-server',
        user: request.user.sub,
        authenticated: true,
      }
    },
  )

  // Auth0 OAuth callback handler
  server.get('/callback', async (request, reply) => {
    const { code, state, error, error_description } = request.query as {
      code?: string
      state?: string
      error?: string
      error_description?: string
    }

    console.log('Auth0 callback received:', {
      code: code ? 'present' : 'missing',
      state,
      error,
    })

    if (error) {
      console.error('Auth0 callback error:', error, error_description)

      // Return error page
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; background: #fee2e2; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; }
            .error { color: #dc2626; margin-bottom: 1rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authentication Error</h1>
            <div class="error">${error}</div>
            <p>${error_description || 'An error occurred during authentication'}</p>
            <button onclick="window.close()">Close Window</button>
          </div>
        </body>
        </html>
      `

      reply.type('text/html')
      return errorHtml
    }

    if (!code) {
      console.error('No authorization code received')

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; background: #fee2e2; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; }
            .error { color: #dc2626; margin-bottom: 1rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authentication Error</h1>
            <div class="error">Missing authorization code</div>
            <p>No authorization code was received from the authentication provider.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
        </body>
        </html>
      `

      reply.type('text/html')
      return errorHtml
    }

    try {
      console.log(
        'Authorization code received successfully:',
        code.substring(0, 20) + '...',
      )

      // Render the success page with user information
      const html = renderTemplate(callbackTemplate, {
        userEmail: 'evan@demoxlabs.xyz', // TODO: Extract from Auth0 token or state
        authCode: code.substring(0, 20) + '...',
      })

      reply.type('text/html')
      return html
    } catch (error) {
      console.error('Error processing callback:', error)

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Server Error</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; background: #fee2e2; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; }
            .error { color: #dc2626; margin-bottom: 1rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Server Error</h1>
            <div class="error">Internal server error</div>
            <p>An error occurred while processing your authentication.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
        </body>
        </html>
      `

      reply.type('text/html')
      return errorHtml
    }
  })

  // Start the server
  const port = 3000
  const host = '0.0.0.0'

  try {
    await server.listen({ port, host })
    console.log(`🚀 Connect RPC server listening on ${host}:${port}`)
    console.log(`📡 gRPC, gRPC-Web, and Connect protocols supported`)
    console.log(`🔒 Auth0 authentication enabled for all RPC calls`)
    console.log(`🔗 OAuth callback URL: http://localhost:${port}/callback`)
    console.log(`❤️  Health check: http://localhost:${port}/health`)
    console.log(`🔐 Protected health: http://localhost:${port}/health/auth`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}
