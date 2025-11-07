import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import {
  type AnyObject,
  createTestApp,
  createEnvReset,
} from './__tests__/helpers.js'

const mockStripeState: {
  webhooksConstructEvent: AnyObject | null
  subscriptionsRetrieve: AnyObject | null
  shouldThrow: string | null
  constructEventShouldThrow: boolean
  eventToReturn: AnyObject | null
} = {
  webhooksConstructEvent: null,
  subscriptionsRetrieve: null,
  shouldThrow: null,
  constructEventShouldThrow: false,
  eventToReturn: null,
}

mock.module('stripe', () => {
  class Stripe {
    webhooks: any
    subscriptions: any

    constructor(_apiKey: string) {
      this.webhooks = {
        constructEvent: (
          rawBody: Buffer | string,
          signature: string,
          secret: string,
        ) => {
          if (mockStripeState.constructEventShouldThrow) {
            mockStripeState.constructEventShouldThrow = false
            throw new Error('Invalid signature')
          }
          mockStripeState.webhooksConstructEvent = {
            rawBody,
            signature,
            secret,
          }
          // If eventToReturn is set, use it; otherwise try to parse from rawBody
          if (mockStripeState.eventToReturn) {
            return mockStripeState.eventToReturn
          }
          // Try to parse from rawBody
          if (typeof rawBody === 'string') {
            try {
              return JSON.parse(rawBody)
            } catch {
              // Fallback
            }
          }
          // Default fallback
          return {
            type: 'checkout.session.completed',
            data: {
              object: {
                id: 'cs_test_123',
                mode: 'subscription',
                customer: 'cus_test_123',
                subscription: 'sub_test_123',
                metadata: { user_sub: 'user-123' },
              },
            },
          }
        },
        constructEventAsync: async (
          rawBody: Buffer | string,
          signature: string,
          secret: string,
        ) => {
          if (mockStripeState.constructEventShouldThrow) {
            mockStripeState.constructEventShouldThrow = false
            throw new Error('Invalid signature')
          }
          mockStripeState.webhooksConstructEvent = {
            rawBody,
            signature,
            secret,
          }
          // If eventToReturn is set, use it; otherwise try to parse from rawBody
          if (mockStripeState.eventToReturn) {
            return mockStripeState.eventToReturn
          }
          // Try to parse from rawBody
          if (typeof rawBody === 'string') {
            try {
              return JSON.parse(rawBody)
            } catch {
              // Fallback
            }
          }
          // Default fallback
          return {
            type: 'checkout.session.completed',
            data: {
              object: {
                id: 'cs_test_123',
                mode: 'subscription',
                customer: 'cus_test_123',
                subscription: 'sub_test_123',
                metadata: { user_sub: 'user-123' },
              },
            },
          }
        },
      }

      this.subscriptions = {
        retrieve: async (subscriptionId: string) => {
          if (mockStripeState.shouldThrow === 'subscriptions.retrieve') {
            mockStripeState.shouldThrow = null
            throw new Error('Stripe API error')
          }
          return {
            id: subscriptionId,
            items: {
              data: [
                {
                  current_period_start: Math.floor(Date.now() / 1000),
                },
              ],
            },
            ...mockStripeState.subscriptionsRetrieve,
          }
        },
      }
    }
  }
  return {
    default: Stripe,
    __mockStripeState: mockStripeState,
  }
})

const mockSubscriptionsRepo: {
  upsertActive: AnyObject | null
  deleteByStripeSubscriptionId: boolean
} = {
  upsertActive: null,
  deleteByStripeSubscriptionId: false,
}

const mockTrialsRepo: {
  getByStripeSubscriptionId: AnyObject | null
  upsertFromStripeSubscription: AnyObject | null
  completeTrial: boolean
  shouldThrow: string | null
} = {
  getByStripeSubscriptionId: null,
  upsertFromStripeSubscription: null,
  completeTrial: false,
  shouldThrow: null,
}

mock.module('../db/repo.js', () => {
  return {
    SubscriptionsRepository: {
      upsertActive: async (
        userId: string,
        stripeCustomerId: string | null,
        stripeSubscriptionId: string | null,
        startAt: Date | null,
      ) => {
        if (mockSubscriptionsRepo.upsertActive === null) {
          return {
            user_id: userId,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            subscription_start_at: startAt,
          }
        }
        if (typeof mockSubscriptionsRepo.upsertActive === 'function') {
          return mockSubscriptionsRepo.upsertActive(
            userId,
            stripeCustomerId,
            stripeSubscriptionId,
            startAt,
          )
        }
        return mockSubscriptionsRepo.upsertActive
      },
      deleteByStripeSubscriptionId: async (subscriptionId: string) => {
        mockSubscriptionsRepo.deleteByStripeSubscriptionId = true
        return true
      },
    },
    TrialsRepository: {
      getByStripeSubscriptionId: async (subscriptionId: string) => {
        if (mockTrialsRepo.shouldThrow === 'getByStripeSubscriptionId') {
          mockTrialsRepo.shouldThrow = null
          throw new Error('Database error')
        }
        if (mockTrialsRepo.getByStripeSubscriptionId === null) {
          return null
        }
        if (typeof mockTrialsRepo.getByStripeSubscriptionId === 'function') {
          return mockTrialsRepo.getByStripeSubscriptionId(subscriptionId)
        }
        return mockTrialsRepo.getByStripeSubscriptionId
      },
      upsertFromStripeSubscription: async (
        userId: string,
        subscriptionId: string,
        trialStartAt: Date | null,
        hasCompletedTrial: boolean,
      ) => {
        if (mockTrialsRepo.shouldThrow === 'upsertFromStripeSubscription') {
          mockTrialsRepo.shouldThrow = null
          throw new Error('Database error')
        }
        if (mockTrialsRepo.upsertFromStripeSubscription === null) {
          return {
            user_id: userId,
            stripe_subscription_id: subscriptionId,
            trial_start_at: trialStartAt,
            has_completed_trial: hasCompletedTrial,
          }
        }
        if (typeof mockTrialsRepo.upsertFromStripeSubscription === 'function') {
          return mockTrialsRepo.upsertFromStripeSubscription(
            userId,
            subscriptionId,
            trialStartAt,
            hasCompletedTrial,
          )
        }
        return mockTrialsRepo.upsertFromStripeSubscription
      },
      completeTrial: async (userId: string) => {
        if (mockTrialsRepo.shouldThrow === 'completeTrial') {
          mockTrialsRepo.shouldThrow = null
          throw new Error('Database error')
        }
        mockTrialsRepo.completeTrial = true
        return {
          user_id: userId,
          has_completed_trial: true,
        }
      },
    },
  }
})

const envReset = createEnvReset()

import { registerStripeWebhook } from './stripeWebhook.js'

describe('registerStripeWebhook', () => {
  beforeEach(() => {
    envReset.set({
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
    })
    mockStripeState.webhooksConstructEvent = null
    mockStripeState.subscriptionsRetrieve = null
    mockStripeState.shouldThrow = null
    mockStripeState.constructEventShouldThrow = false
    mockStripeState.eventToReturn = null
    mockSubscriptionsRepo.upsertActive = null
    mockSubscriptionsRepo.deleteByStripeSubscriptionId = false
    mockTrialsRepo.getByStripeSubscriptionId = null
    mockTrialsRepo.upsertFromStripeSubscription = null
    mockTrialsRepo.completeTrial = false
    mockTrialsRepo.shouldThrow = null
  })

  afterEach(() => {
    envReset.reset()
  })

  describe('POST /stripe/webhook', () => {
    it('returns 400 when signature is missing', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
        },
        payload: JSON.stringify({}),
      })

      expect(res.statusCode).toBe(400)
      expect(res.body).toBe('Missing signature')
      await app.close()
    })

    it('returns 400 when signature verification fails', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      mockStripeState.constructEventShouldThrow = true

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'invalid_signature',
        },
        payload: JSON.stringify({}),
      })

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('Webhook signature verification failed')
      await app.close()
    })

    it('handles checkout.session.completed event for subscription', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'subscription',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: { user_sub: 'user-123' },
            client_reference_id: null,
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload
      mockStripeState.subscriptionsRetrieve = {
        id: 'sub_test_123',
        items: {
          data: [
            {
              current_period_start: Math.floor(Date.now() / 1000),
            },
          ],
        },
      }

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.received).toBe(true)
      expect(mockTrialsRepo.completeTrial).toBe(true)
      await app.close()
    })

    it('handles checkout.session.async_payment_succeeded event', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'checkout.session.async_payment_succeeded',
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'subscription',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: null,
            client_reference_id: 'user-123',
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.received).toBe(true)
      expect(mockTrialsRepo.completeTrial).toBe(true)
      await app.close()
    })

    it('skips checkout.session.completed when mode is not subscription', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'payment',
            customer: 'cus_test_123',
            subscription: null,
            metadata: { user_sub: 'user-123' },
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      expect(mockTrialsRepo.completeTrial).toBe(false)
      await app.close()
    })

    it('skips checkout.session.completed when user_sub is missing', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'subscription',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: null,
            client_reference_id: null,
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      expect(mockTrialsRepo.completeTrial).toBe(false)
      await app.close()
    })

    it('handles customer.subscription.created event', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'active',
            customer: 'cus_test_123',
            metadata: { user_sub: 'user-123' },
            items: {
              data: [
                {
                  current_period_start: Math.floor(Date.now() / 1000),
                },
              ],
            },
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload
      // Mock that this is not a trial subscription
      mockTrialsRepo.getByStripeSubscriptionId = null

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.received).toBe(true)
      expect(mockTrialsRepo.completeTrial).toBe(true)
      await app.close()
    })

    it('handles customer.subscription.updated event with active status', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'active',
            customer: 'cus_test_123',
            metadata: { user_sub: 'user-123' },
            items: {
              data: [
                {
                  current_period_start: Math.floor(Date.now() / 1000),
                },
              ],
            },
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload
      // Mock that this is not a trial subscription
      mockTrialsRepo.getByStripeSubscriptionId = null

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.received).toBe(true)
      expect(mockTrialsRepo.completeTrial).toBe(true)
      await app.close()
    })

    it('handles customer.subscription.updated event with canceled status', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'canceled',
            customer: 'cus_test_123',
            metadata: { user_sub: 'user-123' },
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload
      // Mock that this is not a trial subscription
      mockTrialsRepo.getByStripeSubscriptionId = null

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.received).toBe(true)
      expect(mockSubscriptionsRepo.deleteByStripeSubscriptionId).toBe(true)
      expect(mockTrialsRepo.completeTrial).toBe(false)
      await app.close()
    })

    it('skips customer.subscription.updated when status is not active', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'past_due',
            customer: 'cus_test_123',
            metadata: { user_sub: 'user-123' },
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload
      // Mock that this is not a trial subscription
      mockTrialsRepo.getByStripeSubscriptionId = null

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      expect(mockTrialsRepo.completeTrial).toBe(false)
      expect(mockSubscriptionsRepo.deleteByStripeSubscriptionId).toBe(false)
      await app.close()
    })

    it('skips customer.subscription events when user_sub is missing', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'active',
            customer: 'cus_test_123',
            metadata: {},
            items: {
              data: [
                {
                  current_period_start: Math.floor(Date.now() / 1000),
                },
              ],
            },
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      expect(mockTrialsRepo.completeTrial).toBe(false)
      await app.close()
    })

    it('handles customer.subscription.deleted event', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'canceled',
            customer: 'cus_test_123',
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.received).toBe(true)
      expect(mockSubscriptionsRepo.deleteByStripeSubscriptionId).toBe(true)
      await app.close()
    })

    it('handles customer.subscription.deleted when id is missing', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: null,
            status: 'canceled',
            customer: 'cus_test_123',
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      expect(mockSubscriptionsRepo.deleteByStripeSubscriptionId).toBe(false)
      await app.close()
    })

    it('handles unknown event types gracefully', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.received).toBe(true)
      await app.close()
    })

    it('handles processing errors gracefully', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'subscription',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: { user_sub: 'user-123' },
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload
      mockStripeState.shouldThrow = 'subscriptions.retrieve'

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.error).toBe('Internal error')
      await app.close()
    })

    it('handles customer.subscription.created event for trial subscription', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'trialing',
            customer: 'cus_test_123',
            metadata: { user_sub: 'user-123' },
            trial_start: Math.floor(Date.now() / 1000),
            items: {
              data: [
                {
                  current_period_start: Math.floor(Date.now() / 1000),
                },
              ],
            },
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload
      // Mock that this IS a trial subscription
      mockTrialsRepo.getByStripeSubscriptionId = {
        user_id: 'user-123',
        stripe_subscription_id: 'sub_test_123',
      }

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.received).toBe(true)
      // Should update trial but not complete it (status is trialing)
      expect(mockTrialsRepo.completeTrial).toBe(false)
      await app.close()
    })

    it('handles customer.subscription.trial_will_end event', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'customer.subscription.trial_will_end',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'trialing',
            customer: 'cus_test_123',
            metadata: { user_sub: 'user-123' },
            trial_start: Math.floor(Date.now() / 1000),
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload
      // Mock that this IS a trial subscription
      mockTrialsRepo.getByStripeSubscriptionId = {
        user_id: 'user-123',
        stripe_subscription_id: 'sub_test_123',
      }

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.received).toBe(true)
      // Should update trial status but not complete it
      expect(mockTrialsRepo.completeTrial).toBe(false)
      await app.close()
    })

    it('handles customer.subscription.paused event', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'customer.subscription.paused',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'paused',
            customer: 'cus_test_123',
            metadata: { user_sub: 'user-123' },
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload
      // Mock that this IS a trial subscription
      mockTrialsRepo.getByStripeSubscriptionId = {
        user_id: 'user-123',
        stripe_subscription_id: 'sub_test_123',
      }

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.received).toBe(true)
      // Should mark trial as completed (paused due to no payment method)
      expect(mockTrialsRepo.completeTrial).toBe(false)
      await app.close()
    })

    it('handles customer.subscription.deleted event for trial subscription', async () => {
      const app = createTestApp()
      await registerStripeWebhook(app)

      const eventPayload = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'canceled',
            customer: 'cus_test_123',
            metadata: { user_sub: 'user-123' },
          },
        },
      }

      mockStripeState.eventToReturn = eventPayload
      // Mock that this IS a trial subscription
      mockTrialsRepo.getByStripeSubscriptionId = {
        user_id: 'user-123',
        stripe_subscription_id: 'sub_test_123',
      }

      const res = await app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'valid_signature',
        },
        payload: JSON.stringify(eventPayload),
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.received).toBe(true)
      expect(mockSubscriptionsRepo.deleteByStripeSubscriptionId).toBe(true)
      // Should update trial status to completed
      expect(mockTrialsRepo.completeTrial).toBe(false)
      await app.close()
    })
  })
})
