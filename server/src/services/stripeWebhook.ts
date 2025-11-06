import type { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { SubscriptionsRepository, TrialsRepository } from '../db/repo.js'

export const registerStripeWebhook = async (fastify: FastifyInstance) => {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET
  if (!STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY')
  if (!STRIPE_WEBHOOK_SECRET) throw new Error('Missing STRIPE_WEBHOOK_SECRET')

  const stripe = new Stripe(STRIPE_SECRET_KEY)

  // Scope a child instance to avoid global parser conflicts
  await fastify.register(async function (f) {
    f.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (req, body, done) => {
        try {
          ;(req as any).rawBody = body
          const json = body.length ? JSON.parse(body.toString()) : {}
          done(null, json)
        } catch (err) {
          done(err as any, undefined)
        }
      },
    )

    // Public webhook endpoint
    f.post('/stripe/webhook', async (request, reply) => {
      const sig = request.headers['stripe-signature'] as string | undefined
      if (!sig) {
        reply.code(400).send('Missing signature')
        return
      }

      let event: Stripe.Event
      try {
        const raw = (request as any).rawBody || (request as any).body
        event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET)
      } catch (err: any) {
        reply
          .code(400)
          .send(`Webhook signature verification failed: ${err?.message}`)
        return
      }

      try {
        switch (event.type) {
          case 'checkout.session.completed':
          case 'checkout.session.async_payment_succeeded': {
            const session = event.data.object as Stripe.Checkout.Session
            if (session.mode !== 'subscription') break
            const userSub = (session.metadata?.user_sub ||
              session.client_reference_id) as string | undefined
            const stripeCustomerId = (session.customer as string) || null
            const stripeSubscriptionId =
              (session.subscription as string) || null
            if (!userSub || !stripeSubscriptionId) break

            const sub =
              await stripe.subscriptions.retrieve(stripeSubscriptionId)
            const startSec = sub.items.data[0]?.current_period_start || null
            const subscriptionStartAt = startSec
              ? new Date(startSec * 1000)
              : null

            await SubscriptionsRepository.upsertActive(
              userSub,
              stripeCustomerId,
              stripeSubscriptionId,
              subscriptionStartAt,
            )
            await TrialsRepository.completeTrial(userSub)
            break
          }

          case 'customer.subscription.created':
          case 'customer.subscription.updated': {
            const sub = event.data.object as Stripe.Subscription
            const userSub = (sub.metadata?.user_sub || sub.metadata?.user) as
              | string
              | undefined
            if (!userSub) break

            // Check if this is a trial subscription
            const trialRow = await TrialsRepository.getByStripeSubscriptionId(
              sub.id,
            )
            if (trialRow) {
              // Sync trial status from Stripe
              const trialStartAt = sub.trial_start
                ? new Date(sub.trial_start * 1000)
                : null
              const hasCompletedTrial =
                sub.status === 'active' ||
                sub.status === 'past_due' ||
                sub.status === 'canceled' ||
                sub.status === 'incomplete_expired'

              await TrialsRepository.upsertFromStripeSubscription(
                userSub,
                sub.id,
                trialStartAt,
                hasCompletedTrial,
              )
            }

            if (sub.status === 'canceled') {
              if (sub.id) {
                await SubscriptionsRepository.deleteByStripeSubscriptionId(
                  sub.id,
                )
              }
              break
            }
            if (sub.status !== 'active') break

            const stripeCustomerId = sub.customer as string
            const stripeSubscriptionId = sub.id
            const startSec = sub.items.data[0]?.current_period_start || null
            const subscriptionStartAt = startSec
              ? new Date(startSec * 1000)
              : null

            await SubscriptionsRepository.upsertActive(
              userSub,
              stripeCustomerId,
              stripeSubscriptionId,
              subscriptionStartAt,
            )
            // Mark trial as completed when subscription becomes active
            if (sub.status === 'active') {
              await TrialsRepository.completeTrial(userSub)
            }
            break
          }

          case 'customer.subscription.deleted': {
            const sub = event.data.object as Stripe.Subscription
            const userSub = (sub.metadata?.user_sub || sub.metadata?.user) as
              | string
              | undefined

            // Update trial status if this was a trial subscription
            if (userSub) {
              const trialRow = await TrialsRepository.getByStripeSubscriptionId(
                sub.id,
              )
              if (trialRow) {
                await TrialsRepository.upsertFromStripeSubscription(
                  userSub,
                  sub.id,
                  null,
                  true, // Trial completed (canceled)
                )
              }
            }

            if (sub.id) {
              await SubscriptionsRepository.deleteByStripeSubscriptionId(sub.id)
            }
            break
          }

          case 'customer.subscription.trial_will_end': {
            const sub = event.data.object as Stripe.Subscription
            const userSub = (sub.metadata?.user_sub || sub.metadata?.user) as
              | string
              | undefined
            if (!userSub) break

            // Sync trial status - trial is ending soon
            const trialRow = await TrialsRepository.getByStripeSubscriptionId(
              sub.id,
            )
            if (trialRow) {
              const trialStartAt = sub.trial_start
                ? new Date(sub.trial_start * 1000)
                : null
              await TrialsRepository.upsertFromStripeSubscription(
                userSub,
                sub.id,
                trialStartAt,
                false, // Still in trial
              )
            }
            break
          }

          case 'customer.subscription.paused': {
            const sub = event.data.object as Stripe.Subscription
            const userSub = (sub.metadata?.user_sub || sub.metadata?.user) as
              | string
              | undefined
            if (!userSub) break

            // Trial ended without payment method and was paused
            const trialRow = await TrialsRepository.getByStripeSubscriptionId(
              sub.id,
            )
            if (trialRow) {
              await TrialsRepository.upsertFromStripeSubscription(
                userSub,
                sub.id,
                null,
                true, // Trial completed (paused due to no payment method)
              )
            }
            break
          }
        }

        reply.code(200).send({ received: true })
      } catch (err: any) {
        fastify.log.error({ err }, 'Stripe webhook processing failed')
        reply.code(500).send({ error: 'Internal error' })
      }
    })
  })
}

export default registerStripeWebhook
