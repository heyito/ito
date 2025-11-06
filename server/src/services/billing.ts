import { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { SubscriptionsRepository, TrialsRepository } from '../db/repo.js'

async function getAuth0ManagementToken(): Promise<string | null> {
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
  const AUTH0_MGMT_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID
  const AUTH0_MGMT_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET

  if (!AUTH0_DOMAIN || !AUTH0_MGMT_CLIENT_ID || !AUTH0_MGMT_CLIENT_SECRET) {
    return null
  }

  try {
    const tokenUrl = `https://${AUTH0_DOMAIN}/oauth/token`
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: AUTH0_MGMT_CLIENT_ID,
        client_secret: AUTH0_MGMT_CLIENT_SECRET,
        audience: `https://${AUTH0_DOMAIN}/api/v2/`,
      }),
    })
    const data: any = await res.json()
    if (!res.ok || !data?.access_token) {
      return null
    }
    return data.access_token as string
  } catch {
    return null
  }
}

async function getUserInfoFromAuth0(
  userSub: string,
): Promise<{ email?: string; name?: string } | null> {
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
  if (!AUTH0_DOMAIN) return null

  const token = await getAuth0ManagementToken()
  if (!token) return null

  try {
    const encodedSub = encodeURIComponent(userSub)
    const url = `https://${AUTH0_DOMAIN}/api/v2/users/${encodedSub}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) return null

    const user = await res.json()
    return {
      email: user.email as string | undefined,
      name: user.name as string | undefined,
    }
  } catch {
    return null
  }
}

type Options = {
  requireAuth: boolean
}

function getEnv(name: string): string {
  const v = process.env[name]
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
  const STRIPE_PUBLIC_BASE_URL = getEnv('STRIPE_PUBLIC_BASE_URL') // e.g., http://localhost:3000 or https://api.domain

  const stripe = new Stripe(STRIPE_SECRET_KEY)

  fastify.post('/billing/checkout', async (request, reply) => {
    console.log('billing/checkout', request.body)
    try {
      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      // Get user info from Auth0 Management API (access token only has 'sub')
      const auth0UserInfo = await getUserInfoFromAuth0(userSub)
      const userEmail = auth0UserInfo?.email

      console.log('STRIPE_PRICE_ID', STRIPE_PRICE_ID)

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        client_reference_id: userSub,
        customer_email: userEmail,
        metadata: { user_sub: userSub },
        subscription_data: {
          metadata: { user_sub: userSub },
        },
        line_items: [
          {
            price: STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        success_url: `${STRIPE_PUBLIC_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${STRIPE_PUBLIC_BASE_URL}/billing/cancel`,
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

      if (!session.customer || typeof session.customer !== 'string') {
        throw new Error('Session missing customer ID')
      }

      if (!session.subscription || typeof session.subscription !== 'string') {
        throw new Error('Session missing subscription ID')
      }

      const stripeCustomerId = session.customer
      const stripeSubscriptionId = session.subscription

      // Update customer with name from Auth0 (access token only has 'sub')
      const auth0UserInfo = await getUserInfoFromAuth0(userSub)
      if (auth0UserInfo?.name && stripeCustomerId) {
        await stripe.customers.update(stripeCustomerId, {
          name: auth0UserInfo.name,
          metadata: { user_sub: userSub },
        })
      }

      // Check if subscription already exists (idempotency check)
      const existingSub = await SubscriptionsRepository.getByUserId(userSub)
      if (existingSub?.stripe_subscription_id === stripeSubscriptionId) {
        // Already processed - return existing data
        reply.send({
          success: true,
          pro_status: 'active_pro',
          subscriptionStartAt: existingSub.subscription_start_at,
        })
        return
      }

      const subscription =
        await stripe.subscriptions.retrieve(stripeSubscriptionId)

      if (!subscription.items.data[0]?.current_period_start) {
        throw new Error('Subscription missing current_period_start')
      }

      const subscriptionStartAt = new Date(
        subscription.items.data[0].current_period_start * 1000,
      )

      const upserted = await SubscriptionsRepository.upsertActive(
        userSub,
        stripeCustomerId,
        stripeSubscriptionId,
        subscriptionStartAt,
      )

      // End trial if applicable (idempotent - safe to call multiple times)
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

  fastify.post('/billing/cancel', async (request, reply) => {
    try {
      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      const sub = await SubscriptionsRepository.getByUserId(userSub)
      if (!sub || !sub.stripe_subscription_id) {
        reply
          .code(400)
          .send({ success: false, error: 'No active subscription found' })
        return
      }

      await stripe.subscriptions.cancel(sub.stripe_subscription_id)

      reply.send({ success: true })
    } catch (error: any) {
      fastify.log.error(
        { err: error },
        'Stripe subscription cancellation failed',
      )
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
      const trial = await TrialsRepository.getByUserId(userSub)

      const TRIAL_DAYS = 14
      const dayMs = 24 * 60 * 60 * 1000

      // If user has an active paid subscription, return that
      if (sub) {
        const trialBlock = {
          trialDays: TRIAL_DAYS,
          trialStartAt: trial?.trial_start_at
            ? trial.trial_start_at.toISOString()
            : null,
          daysLeft: 0,
          isTrialActive: false,
          hasCompletedTrial: true,
        }

        reply.send({
          success: true,
          pro_status: 'active_pro',
          subscriptionStartAt: sub.subscription_start_at,
          trial: trialBlock,
        })
        return
      }

      // Check Stripe subscription status for trial
      if (trial?.stripe_subscription_id) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(
            trial.stripe_subscription_id,
          )

          const now = Date.now()
          const trialEnd = stripeSubscription.trial_end
            ? new Date(stripeSubscription.trial_end * 1000)
            : null
          const trialStart = trialEnd
            ? new Date(trialEnd.getTime() - TRIAL_DAYS * dayMs)
            : trial?.trial_start_at || null

          let daysLeft = 0
          let isTrialActive = false

          if (
            trialEnd &&
            stripeSubscription.status === 'trialing' &&
            !trial.has_completed_trial &&
            trialStart
          ) {
            const elapsedMs = now - trialStart.getTime()
            const elapsedDays = Math.floor(elapsedMs / dayMs)
            daysLeft = Math.max(0, TRIAL_DAYS - elapsedDays)
            isTrialActive = daysLeft > 0
          }

          const trialBlock = {
            trialDays: TRIAL_DAYS,
            trialStartAt: trialStart ? trialStart.toISOString() : null,
            daysLeft,
            isTrialActive,
            hasCompletedTrial: trial.has_completed_trial,
          }

          if (isTrialActive) {
            reply.send({
              success: true,
              pro_status: 'free_trial',
              trial: trialBlock,
            })
            return
          }
        } catch (stripeError: any) {
          // If Stripe subscription doesn't exist, fall back to database status
          fastify.log.warn(
            { err: stripeError },
            'Failed to retrieve Stripe subscription, using database status',
          )
        }
      }

      // Fall back to database trial status
      const now = Date.now()
      const startMs = trial?.trial_start_at?.getTime()
      const isTrialActive =
        !!startMs &&
        now - startMs < TRIAL_DAYS * dayMs &&
        !trial?.has_completed_trial
      const daysElapsed = startMs ? Math.floor((now - startMs) / dayMs) : 0
      const daysLeft = Math.max(0, TRIAL_DAYS - daysElapsed)

      const trialBlock = {
        trialDays: TRIAL_DAYS,
        trialStartAt: trial?.trial_start_at
          ? trial.trial_start_at.toISOString()
          : null,
        daysLeft,
        isTrialActive,
        hasCompletedTrial: !!trial?.has_completed_trial,
      }

      if (isTrialActive) {
        reply.send({
          success: true,
          pro_status: 'free_trial',
          trial: trialBlock,
        })
        return
      }

      reply.send({ success: true, pro_status: 'none', trial: trialBlock })
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
