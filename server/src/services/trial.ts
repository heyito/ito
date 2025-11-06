import type { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { TrialsRepository, SubscriptionsRepository } from '../db/repo.js'

const TRIAL_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

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
    // URL encode the user_id (sub) - Auth0 user IDs can contain special characters
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

async function getOrCreateStripeCustomer(
  stripe: Stripe,
  userSub: string,
  email?: string,
  name?: string,
): Promise<string> {
  // Check if user already has a subscription with a customer ID
  const existingSub = await SubscriptionsRepository.getByUserId(userSub)
  if (existingSub?.stripe_customer_id) {
    // Update existing customer with name/email if provided
    if (name || email) {
      await stripe.customers.update(existingSub.stripe_customer_id, {
        email: email,
        name: name,
        metadata: { user_sub: userSub },
      })
    }
    return existingSub.stripe_customer_id
  }

  // Search for existing customer by metadata
  const existingCustomers = await stripe.customers.search({
    query: `metadata['user_sub']:'${userSub}'`,
    limit: 1,
  })

  if (existingCustomers.data.length > 0) {
    const customerId = existingCustomers.data[0].id
    // Update existing customer with name/email if provided
    console.log('Updating existing customer with name/email', name, email)
    if (name || email) {
      await stripe.customers.update(customerId, {
        email: email ?? undefined,
        name: name ?? undefined,
        metadata: { user_sub: userSub },
      })
    }
    return customerId
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email: email,
    name: name,
    metadata: { user_sub: userSub },
  })

  return customer.id
}

function computeStatusFromStripe(subscription: Stripe.Subscription): {
  success: boolean
  trialDays: number
  trialStartAt: string | null
  daysLeft: number
  isTrialActive: boolean
  hasCompletedTrial: boolean
} {
  const now = Date.now()
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null
  const trialStart = trialEnd
    ? new Date(trialEnd.getTime() - TRIAL_DAYS * MS_PER_DAY)
    : null

  let daysLeft = 0
  let isTrialActive = false

  if (trialEnd && subscription.status === 'trialing') {
    const elapsedMs = now - trialStart!.getTime()
    const elapsedDays = Math.floor(elapsedMs / MS_PER_DAY)
    daysLeft = Math.max(0, TRIAL_DAYS - elapsedDays)
    isTrialActive = daysLeft > 0
  }

  const hasCompletedTrial =
    subscription.status === 'active' ||
    subscription.status === 'past_due' ||
    subscription.status === 'canceled'

  return {
    success: true,
    trialDays: TRIAL_DAYS,
    trialStartAt: trialStart ? trialStart.toISOString() : null,
    daysLeft,
    isTrialActive,
    hasCompletedTrial,
  }
}

function computeStatus(row: {
  trial_start_at: Date | null
  has_completed_trial: boolean
}) {
  const now = Date.now()
  const trialStartAt = row.trial_start_at ? new Date(row.trial_start_at) : null
  let daysLeft = 0
  if (trialStartAt && !row.has_completed_trial) {
    const elapsedDays = Math.floor((now - trialStartAt.getTime()) / MS_PER_DAY)
    daysLeft = Math.max(0, TRIAL_DAYS - elapsedDays)
  }
  const isTrialActive =
    !!trialStartAt && !row.has_completed_trial && daysLeft > 0

  return {
    success: true,
    trialDays: TRIAL_DAYS,
    trialStartAt: trialStartAt ? trialStartAt.toISOString() : null,
    daysLeft,
    isTrialActive,
    hasCompletedTrial: row.has_completed_trial,
  }
}

export const registerTrialRoutes = async (
  fastify: FastifyInstance,
  options: { requireAuth: boolean },
) => {
  const { requireAuth } = options

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
  const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID

  if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
    fastify.log.warn(
      'Stripe credentials not configured; trial routes will fail',
    )
  }

  const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null

  fastify.post('/trial/start', async (request, reply) => {
    try {
      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      if (!stripe) {
        reply.code(500).send({ success: false, error: 'Stripe not configured' })
        return
      }

      // Check if user already has a trial subscription
      const existingTrial = await TrialsRepository.getByUserId(userSub)
      if (existingTrial?.stripe_subscription_id) {
        // Fetch current status from Stripe
        const subscription = await stripe.subscriptions.retrieve(
          existingTrial.stripe_subscription_id,
        )
        const status = computeStatusFromStripe(subscription)

        // Sync status to database
        const trialEndAt = subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null
        await TrialsRepository.upsertFromStripeSubscription(
          userSub,
          subscription.id,
          status.trialStartAt ? new Date(status.trialStartAt) : null,
          status.hasCompletedTrial,
          trialEndAt,
        )

        reply.send(status)
        return
      }

      // Check if user already completed trial
      if (existingTrial?.has_completed_trial) {
        reply.send(computeStatus(existingTrial))
        return
      }

      // Get user info from Auth0 Management API (access token only has 'sub')
      const auth0UserInfo = await getUserInfoFromAuth0(userSub)
      const userEmail = auth0UserInfo?.email
      const userName = auth0UserInfo?.name

      const stripeCustomerId = await getOrCreateStripeCustomer(
        stripe,
        userSub,
        userEmail,
        userName,
      )

      // Create subscription with trial
      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: STRIPE_PRICE_ID }],
        trial_period_days: TRIAL_DAYS,
        trial_settings: {
          end_behavior: {
            missing_payment_method: 'cancel',
          },
        },
        metadata: { user_sub: userSub },
      })

      // Store trial in database
      const trialStartAt = subscription.trial_start
        ? new Date(subscription.trial_start * 1000)
        : null
      const trialEndAt = subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null
      const row = await TrialsRepository.upsertFromStripeSubscription(
        userSub,
        subscription.id,
        trialStartAt,
        false,
        trialEndAt,
      )

      const status = computeStatusFromStripe(subscription)
      reply.send(status)
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Trial start failed')
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })

  fastify.post('/trial/complete', async (request, reply) => {
    try {
      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }
      const row = await TrialsRepository.completeTrial(userSub)
      reply.send(computeStatus(row))
    } catch (error: any) {
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })
}
