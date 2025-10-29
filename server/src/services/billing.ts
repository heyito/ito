import { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { SubscriptionsRepository, TrialsRepository } from '../db/repo.js'

type Options = {
  requireAuth: boolean
}

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

function renderDeepLinkHtml(targetUrl: string): string {
  const escaped = targetUrl.replace(/"/g, '&quot;')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Returning to Ito…</title></head><body>
  <p>If you are not redirected automatically, click below:</p>
  <a href="${escaped}">Return to Ito</a>
  <script>window.location = "${escaped}";</script>
  </body></html>`
}

export const registerBillingRoutes = async (
  fastify: FastifyInstance,
  options: Options,
) => {
  const { requireAuth } = options

  const STRIPE_SECRET_KEY = getEnv('STRIPE_SECRET_KEY')
  const STRIPE_PRICE_ID = getEnv('STRIPE_PRICE_ID')
  const APP_PROTOCOL = getEnv('APP_PROTOCOL') // e.g., ito-dev or ito
  const PUBLIC_BASE_URL = getEnv('PUBLIC_BASE_URL') // e.g., http://localhost:3000 or https://api.domain

  const stripe = new Stripe(STRIPE_SECRET_KEY)

  fastify.post('/billing/checkout', async (request, reply) => {
    console.log('billing/checkout', request.body)
    try {
      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      console.log('STRIPE_PRICE_ID', STRIPE_PRICE_ID)

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        client_reference_id: userSub,
        metadata: { user_sub: userSub },
        line_items: [
          {
            price: STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        success_url: `${PUBLIC_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${PUBLIC_BASE_URL}/billing/cancel`,
      })

      console.log('session', session)

      reply.send({ success: true, url: session.url })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Stripe checkout creation failed')
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })

  fastify.post('/billing/confirm', async (request, reply) => {
    try {
      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      const body = request.body as { session_id?: string }
      const sessionId = body?.session_id
      if (!sessionId) {
        reply.code(400).send({ success: false, error: 'Missing session_id' })
        return
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId)
      if (session.mode !== 'subscription') {
        reply.code(400).send({ success: false, error: 'Invalid session mode' })
        return
      }

      // Accept both fully completed and paid statuses
      const isCompleted = session.status === 'complete'
      const isPaid = session.payment_status === 'paid'
      if (!isCompleted && !isPaid) {
        reply.code(400).send({ success: false, error: 'Session not completed' })
        return
      }

      const stripeCustomerId = (session.customer as string) || null
      const stripeSubscriptionId = (session.subscription as string) || null

      let subscriptionStartAt: Date | null = null
      if (stripeSubscriptionId) {
        const subscription =
          await stripe.subscriptions.retrieve(stripeSubscriptionId)
        const startSec =
          subscription.items.data[0]?.current_period_start || null
        subscriptionStartAt = startSec ? new Date(startSec * 1000) : null
      }

      const upserted = await SubscriptionsRepository.upsertActive(
        userSub,
        stripeCustomerId,
        stripeSubscriptionId,
        subscriptionStartAt,
      )

      // End trial if applicable
      await TrialsRepository.completeTrial(userSub)

      reply.send({
        success: true,
        pro_status: 'active_pro',
        subscriptionStartAt: upserted.subscription_start_at,
      })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Stripe confirm failed')
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })

  fastify.get('/billing/status', async (request, reply) => {
    try {
      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      const sub = await SubscriptionsRepository.getByUserId(userSub)
      if (sub) {
        reply.send({
          success: true,
          pro_status: 'active_pro',
          subscriptionStartAt: sub.subscription_start_at,
        })
        return
      }

      const trial = await TrialsRepository.getByUserId(userSub)
      const now = Date.now()
      const start = trial?.trial_start_at?.getTime()
      const TRIAL_DAYS = 14
      const isTrialActive =
        !!start &&
        now - start < TRIAL_DAYS * 24 * 60 * 60 * 1000 &&
        !trial?.has_completed_trial

      if (isTrialActive) {
        reply.send({ success: true, pro_status: 'free_trial' })
        return
      }

      reply.send({ success: true, pro_status: 'none' })
    } catch (error: any) {
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })
}

// Public routes that must be accessible without authentication
export const registerBillingPublicRoutes = async (fastify: FastifyInstance) => {
  const APP_PROTOCOL = getEnv('APP_PROTOCOL') // e.g., ito-dev or ito

  fastify.get('/billing/success', async (request, reply) => {
    const { session_id } = request.query as { session_id?: string }
    const deeplink = `${APP_PROTOCOL}://billing/success${
      session_id ? `?session_id=${encodeURIComponent(session_id)}` : ''
    }`
    reply.type('text/html').send(renderDeepLinkHtml(deeplink))
  })

  fastify.get('/billing/cancel', async (_request, reply) => {
    const deeplink = `${APP_PROTOCOL}://billing/cancel`
    reply.type('text/html').send(renderDeepLinkHtml(deeplink))
  })
}

export default registerBillingRoutes
