import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import {
  type AnyObject,
  createTestAppWithAuth,
  createTestApp,
  createEnvReset,
} from './__tests__/helpers.js'

const mockStripeState: {
  checkoutSessionsCreate: AnyObject | null
  checkoutSessionsRetrieve: AnyObject | null
  subscriptionsRetrieve: AnyObject | null
  subscriptionsUpdate: AnyObject | null
  subscriptionsCancel: AnyObject | null
  shouldThrow: string | null
} = {
  checkoutSessionsCreate: null,
  checkoutSessionsRetrieve: null,
  subscriptionsRetrieve: null,
  subscriptionsUpdate: null,
  subscriptionsCancel: null,
  shouldThrow: null,
}

mock.module('stripe', () => {
  class Stripe {
    checkout: any
    subscriptions: any

    constructor(_apiKey: string) {
      this.checkout = {
        sessions: {
          create: async (params: AnyObject) => {
            if (mockStripeState.shouldThrow === 'checkout.create') {
              mockStripeState.shouldThrow = null
              throw new Error('Stripe API error')
            }
            mockStripeState.checkoutSessionsCreate = params
            return {
              id: 'cs_test_123',
              url: 'https://checkout.stripe.com/test',
              mode: 'subscription',
              status: 'open',
              ...mockStripeState.checkoutSessionsCreate,
            }
          },
          retrieve: async (sessionId: string) => {
            if (mockStripeState.shouldThrow === 'checkout.retrieve') {
              mockStripeState.shouldThrow = null
              throw new Error('Stripe API error')
            }
            return {
              id: sessionId,
              mode: 'subscription',
              status: 'complete',
              payment_status: 'paid',
              customer: 'cus_test_123',
              subscription: 'sub_test_123',
              ...mockStripeState.checkoutSessionsRetrieve,
            }
          },
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
        update: async (subscriptionId: string, params: AnyObject) => {
          if (mockStripeState.shouldThrow === 'subscriptions.update') {
            mockStripeState.shouldThrow = null
            throw new Error('Stripe API error')
          }
          mockStripeState.subscriptionsUpdate = { subscriptionId, params }
          const currentPeriodEnd =
            Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30 days from now
          return {
            id: subscriptionId,
            cancel_at_period_end: params.cancel_at_period_end || false,
            current_period_end: currentPeriodEnd,
            status: params.cancel_at_period_end ? 'active' : 'active',
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
        cancel: async (subscriptionId: string) => {
          if (mockStripeState.shouldThrow === 'subscriptions.cancel') {
            mockStripeState.shouldThrow = null
            throw new Error('Stripe API error')
          }
          mockStripeState.subscriptionsCancel = { subscriptionId }
          return { id: subscriptionId, status: 'canceled' }
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
  getByUserId: AnyObject | null
  upsertActive: AnyObject | null
  updateSubscriptionEndAt: AnyObject | null
} = {
  getByUserId: null,
  upsertActive: null,
  updateSubscriptionEndAt: null,
}

const mockTrialsRepo: {
  getByUserId: AnyObject | null
  completeTrial: boolean
} = {
  getByUserId: null,
  completeTrial: false,
}

mock.module('../db/repo.js', () => {
  return {
    SubscriptionsRepository: {
      getByUserId: async (userId: string) => {
        if (mockSubscriptionsRepo.getByUserId === null) {
          return undefined
        }
        if (typeof mockSubscriptionsRepo.getByUserId === 'function') {
          return mockSubscriptionsRepo.getByUserId(userId)
        }
        return mockSubscriptionsRepo.getByUserId
      },
      upsertActive: async (
        userId: string,
        stripeCustomerId: string | null,
        stripeSubscriptionId: string | null,
        startAt: Date | null,
        endAt?: Date | null,
      ) => {
        if (mockSubscriptionsRepo.upsertActive === null) {
          return {
            user_id: userId,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            subscription_start_at: startAt,
            subscription_end_at: endAt ?? null,
          }
        }
        if (typeof mockSubscriptionsRepo.upsertActive === 'function') {
          return mockSubscriptionsRepo.upsertActive(
            userId,
            stripeCustomerId,
            stripeSubscriptionId,
            startAt,
            endAt,
          )
        }
        return mockSubscriptionsRepo.upsertActive
      },
      updateSubscriptionEndAt: async (userId: string, endAt: Date | null) => {
        if (mockSubscriptionsRepo.updateSubscriptionEndAt === null) {
          return {
            user_id: userId,
            subscription_end_at: endAt,
          }
        }
        if (
          typeof mockSubscriptionsRepo.updateSubscriptionEndAt === 'function'
        ) {
          return mockSubscriptionsRepo.updateSubscriptionEndAt(userId, endAt)
        }
        return mockSubscriptionsRepo.updateSubscriptionEndAt
      },
    },
    TrialsRepository: {
      getByUserId: async (userId: string) => {
        if (mockTrialsRepo.getByUserId === null) {
          return undefined
        }
        if (typeof mockTrialsRepo.getByUserId === 'function') {
          return mockTrialsRepo.getByUserId(userId)
        }
        return mockTrialsRepo.getByUserId
      },
      completeTrial: async (userId: string) => {
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

import {
  registerBillingRoutes,
  registerBillingPublicRoutes,
} from './billing.js'

describe('registerBillingRoutes', () => {
  beforeEach(() => {
    envReset.set({
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PRICE_ID: 'price_test_123',
      STRIPE_PUBLIC_BASE_URL: 'http://localhost:3000',
      APP_PROTOCOL: 'ito-dev',
    })
    mockStripeState.checkoutSessionsCreate = null
    mockStripeState.checkoutSessionsRetrieve = null
    mockStripeState.subscriptionsRetrieve = null
    mockStripeState.subscriptionsUpdate = null
    mockStripeState.subscriptionsCancel = null
    mockStripeState.shouldThrow = null
    mockSubscriptionsRepo.getByUserId = null
    mockSubscriptionsRepo.upsertActive = null
    mockSubscriptionsRepo.updateSubscriptionEndAt = null
    mockTrialsRepo.getByUserId = null
    mockTrialsRepo.completeTrial = false
  })

  afterEach(() => {
    envReset.reset()
  })

  describe('POST /billing/checkout', () => {
    it('returns 401 when requireAuth is true and user is missing', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      const res = await app.inject({
        method: 'POST',
        url: '/billing/checkout',
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Unauthorized')
      await app.close()
    })

    it('creates checkout session when authenticated', async () => {
      const app = createTestAppWithAuth()
      await registerBillingRoutes(app, { requireAuth: true })

      const res = await app.inject({
        method: 'POST',
        url: '/billing/checkout',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.url).toBe('https://checkout.stripe.com/test')
      expect(mockStripeState.checkoutSessionsCreate).toMatchObject({
        mode: 'subscription',
        client_reference_id: 'user-123',
        metadata: { user_sub: 'user-123' },
        line_items: [
          {
            price: 'price_test_123',
            quantity: 1,
          },
        ],
      })
      await app.close()
    })

    it('handles Stripe errors gracefully', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockStripeState.shouldThrow = 'checkout.create'

      const res = await app.inject({
        method: 'POST',
        url: '/billing/checkout',
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Stripe API error')
      await app.close()
    })
  })

  describe('POST /billing/confirm', () => {
    it('returns 401 when requireAuth is true and user is missing', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      const res = await app.inject({
        method: 'POST',
        url: '/billing/confirm',
        payload: { session_id: 'cs_test_123' },
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Unauthorized')
      await app.close()
    })

    it('returns 400 when session_id is missing', async () => {
      const app = createTestAppWithAuth()
      await registerBillingRoutes(app, { requireAuth: true })

      const res = await app.inject({
        method: 'POST',
        url: '/billing/confirm',
        payload: {},
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Missing session_id')
      await app.close()
    })

    it('returns 400 when session mode is not subscription', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockStripeState.checkoutSessionsRetrieve = { mode: 'payment' }

      const res = await app.inject({
        method: 'POST',
        url: '/billing/confirm',
        payload: { session_id: 'cs_test_123' },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Invalid session mode')
      await app.close()
    })

    it('returns 400 when session is not completed or paid', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockStripeState.checkoutSessionsRetrieve = {
        mode: 'subscription',
        status: 'open',
        payment_status: 'unpaid',
      }

      const res = await app.inject({
        method: 'POST',
        url: '/billing/confirm',
        payload: { session_id: 'cs_test_123' },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Session not completed')
      await app.close()
    })

    it('accepts completed session', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockStripeState.checkoutSessionsRetrieve = {
        mode: 'subscription',
        status: 'complete',
        payment_status: 'unpaid',
      }

      const res = await app.inject({
        method: 'POST',
        url: '/billing/confirm',
        payload: { session_id: 'cs_test_123' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.pro_status).toBe('active_pro')
      expect(mockTrialsRepo.completeTrial).toBe(true)
      await app.close()
    })

    it('accepts paid session', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockStripeState.checkoutSessionsRetrieve = {
        mode: 'subscription',
        status: 'open',
        payment_status: 'paid',
      }

      const res = await app.inject({
        method: 'POST',
        url: '/billing/confirm',
        payload: { session_id: 'cs_test_123' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.pro_status).toBe('active_pro')
      await app.close()
    })

    it('throws error when session missing customer ID', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockStripeState.checkoutSessionsRetrieve = {
        mode: 'subscription',
        status: 'complete',
        payment_status: 'paid',
        customer: null,
        subscription: 'sub_test_123',
      }

      const res = await app.inject({
        method: 'POST',
        url: '/billing/confirm',
        payload: { session_id: 'cs_test_123' },
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Session missing customer ID')
      await app.close()
    })

    it('throws error when session missing subscription ID', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockStripeState.checkoutSessionsRetrieve = {
        mode: 'subscription',
        status: 'complete',
        payment_status: 'paid',
        customer: 'cus_test_123',
        subscription: null,
      }

      const res = await app.inject({
        method: 'POST',
        url: '/billing/confirm',
        payload: { session_id: 'cs_test_123' },
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Session missing subscription ID')
      await app.close()
    })

    it('throws error when subscription missing current_period_start', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockStripeState.checkoutSessionsRetrieve = {
        mode: 'subscription',
        status: 'complete',
        payment_status: 'paid',
        customer: 'cus_test_123',
        subscription: 'sub_test_123',
      }

      mockStripeState.subscriptionsRetrieve = {
        id: 'sub_test_123',
        items: {
          data: [],
        },
      }

      const res = await app.inject({
        method: 'POST',
        url: '/billing/confirm',
        payload: { session_id: 'cs_test_123' },
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Subscription missing current_period_start')
      await app.close()
    })

    it('handles Stripe errors gracefully', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockStripeState.shouldThrow = 'checkout.retrieve'

      const res = await app.inject({
        method: 'POST',
        url: '/billing/confirm',
        payload: { session_id: 'cs_test_123' },
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Stripe API error')
      await app.close()
    })
  })

  describe('POST /billing/cancel', () => {
    it('returns 401 when requireAuth is true and user is missing', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      const res = await app.inject({
        method: 'POST',
        url: '/billing/cancel',
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Unauthorized')
      await app.close()
    })

    it('returns 400 when no subscription is found', async () => {
      const app = createTestAppWithAuth()
      await registerBillingRoutes(app, { requireAuth: true })

      const res = await app.inject({
        method: 'POST',
        url: '/billing/cancel',
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('No active subscription found')
      await app.close()
    })

    it('returns 400 when subscription has no stripe_subscription_id', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockSubscriptionsRepo.getByUserId = {
        user_id: 'user-123',
        stripe_subscription_id: null,
      }

      const res = await app.inject({
        method: 'POST',
        url: '/billing/cancel',
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('No active subscription found')
      await app.close()
    })

    it('cancels subscription successfully', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockSubscriptionsRepo.getByUserId = {
        user_id: 'user-123',
        stripe_subscription_id: 'sub_test_123',
      }

      const res = await app.inject({
        method: 'POST',
        url: '/billing/cancel',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(mockStripeState.subscriptionsUpdate).toEqual({
        subscriptionId: 'sub_test_123',
        params: { cancel_at_period_end: true },
      })
      await app.close()
    })

    it('handles Stripe errors gracefully', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockSubscriptionsRepo.getByUserId = {
        user_id: 'user-123',
        stripe_subscription_id: 'sub_test_123',
      }

      mockStripeState.shouldThrow = 'subscriptions.update'

      const res = await app.inject({
        method: 'POST',
        url: '/billing/cancel',
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Stripe API error')
      await app.close()
    })
  })

  describe('POST /billing/reactivate', () => {
    it('returns 401 when requireAuth is true and user is missing', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      const res = await app.inject({
        method: 'POST',
        url: '/billing/reactivate',
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Unauthorized')
      await app.close()
    })

    it('reactivates subscription successfully', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockSubscriptionsRepo.getByUserId = {
        user_id: 'user-123',
        stripe_subscription_id: 'sub_test_123',
      }

      const res = await app.inject({
        method: 'POST',
        url: '/billing/reactivate',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(mockStripeState.subscriptionsUpdate).toEqual({
        subscriptionId: 'sub_test_123',
        params: { cancel_at_period_end: false },
      })
      await app.close()
    })
  })

  describe('GET /billing/status', () => {
    it('returns 401 when requireAuth is true and user is missing', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      const res = await app.inject({
        method: 'GET',
        url: '/billing/status',
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Unauthorized')
      await app.close()
    })

    it('returns active_pro when subscription exists', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      const startDate = new Date('2024-01-01')
      mockSubscriptionsRepo.getByUserId = {
        user_id: 'user-123',
        stripe_subscription_id: 'sub_test_123',
        subscription_start_at: startDate,
        subscription_end_at: null,
      }

      const res = await app.inject({
        method: 'GET',
        url: '/billing/status',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.pro_status).toBe('active_pro')
      expect(new Date(body.subscriptionStartAt).getTime()).toBe(
        startDate.getTime(),
      )
      expect(body.subscriptionEndAt).toBe(null)
      expect(body.isScheduledForCancellation).toBe(false)
      expect(body.trial).toBeDefined()
      await app.close()
    })

    it('returns subscription_end_at and isScheduledForCancellation when scheduled for cancellation', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      const startDate = new Date('2024-01-01')
      const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      mockSubscriptionsRepo.getByUserId = {
        user_id: 'user-123',
        stripe_subscription_id: 'sub_test_123',
        subscription_start_at: startDate,
        subscription_end_at: endDate,
      }

      const res = await app.inject({
        method: 'GET',
        url: '/billing/status',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.pro_status).toBe('active_pro')
      expect(new Date(body.subscriptionStartAt).getTime()).toBe(
        startDate.getTime(),
      )
      expect(new Date(body.subscriptionEndAt).getTime()).toBe(endDate.getTime())
      expect(body.isScheduledForCancellation).toBe(true)
      await app.close()
    })

    it('returns free_trial when trial is active', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      const trialStart = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      const trialEnd = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000) // 9 days from now
      mockTrialsRepo.getByUserId = {
        user_id: 'user-123',
        trial_start_at: trialStart,
        trial_end_at: trialEnd,
        has_completed_trial: false,
      }

      const res = await app.inject({
        method: 'GET',
        url: '/billing/status',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.pro_status).toBe('free_trial')
      expect(body.trial.isTrialActive).toBe(true)
      expect(body.trial.daysLeft).toBeGreaterThan(0)
      expect(body.trial.daysLeft).toBeLessThanOrEqual(14)
      await app.close()
    })

    it('returns none when no subscription and trial expired', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      const trialStart = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
      const trialEnd = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) // 6 days ago (expired)
      mockTrialsRepo.getByUserId = {
        user_id: 'user-123',
        trial_start_at: trialStart,
        trial_end_at: trialEnd,
        has_completed_trial: false,
      }

      const res = await app.inject({
        method: 'GET',
        url: '/billing/status',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.pro_status).toBe('none')
      expect(body.trial.isTrialActive).toBe(false)
      expect(body.trial.daysLeft).toBe(0)
      await app.close()
    })

    it('returns none when no subscription and trial completed', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      const trialStart = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      mockTrialsRepo.getByUserId = {
        user_id: 'user-123',
        trial_start_at: trialStart,
        has_completed_trial: true,
      }

      const res = await app.inject({
        method: 'GET',
        url: '/billing/status',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.pro_status).toBe('none')
      expect(body.trial.isTrialActive).toBe(false)
      await app.close()
    })

    it('handles errors gracefully', async () => {
      const app = createTestApp()
      await registerBillingRoutes(app, { requireAuth: true })

      app.addHook('preHandler', async req => {
        ;(req as any).user = { sub: 'user-123' }
      })

      mockSubscriptionsRepo.getByUserId = () => {
        throw new Error('Database error')
      }

      const res = await app.inject({
        method: 'GET',
        url: '/billing/status',
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Database error')
      await app.close()
    })
  })
})

describe('registerBillingPublicRoutes', () => {
  beforeEach(() => {
    envReset.set({
      APP_PROTOCOL: 'ito-dev',
    })
  })

  afterEach(() => {
    envReset.reset()
  })

  it('renders success page with session_id', async () => {
    const app = createTestApp()
    await registerBillingPublicRoutes(app)

    const res = await app.inject({
      method: 'GET',
      url: '/billing/success?session_id=cs_test_123',
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain(
      'ito-dev://billing/success?session_id=cs_test_123',
    )
    expect(res.body).toContain('Returning to Ito')
    await app.close()
  })

  it('renders success page without session_id', async () => {
    const app = createTestApp()
    await registerBillingPublicRoutes(app)

    const res = await app.inject({
      method: 'GET',
      url: '/billing/success',
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('ito-dev://billing/success')
    expect(res.body).not.toContain('session_id=')
    await app.close()
  })

  it('renders cancel page', async () => {
    const app = createTestApp()
    await registerBillingPublicRoutes(app)

    const res = await app.inject({
      method: 'GET',
      url: '/billing/cancel',
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('ito-dev://billing/cancel')
    expect(res.body).toContain('Returning to Ito')
    await app.close()
  })

  it('escapes quotes in deeplink URL', async () => {
    const app = createTestApp()
    await registerBillingPublicRoutes(app)

    process.env.APP_PROTOCOL = 'ito-dev'

    const res = await app.inject({
      method: 'GET',
      url: '/billing/success?session_id=test"quote',
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('test%22quote')
    expect(res.body).not.toContain('test"quote')
    await app.close()
  })
})
