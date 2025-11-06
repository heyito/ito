import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import {
  type AnyObject,
  createTestAppWithAuth,
  createTestApp,
  createEnvReset,
} from './__tests__/helpers.js'

const mockTrialsRepo: {
  getByUserId: AnyObject | null
  upsertFromStripeSubscription: AnyObject | null
  completeTrial: AnyObject | null
  shouldThrow: string | null
} = {
  getByUserId: null,
  upsertFromStripeSubscription: null,
  completeTrial: null,
  shouldThrow: null,
}

const mockSubscriptionsRepo: {
  getByUserId: AnyObject | null
} = {
  getByUserId: null,
}

const mockStripe: {
  customers: {
    search: any
    create: any
    update: any
  }
  subscriptions: {
    create: any
    retrieve: any
    list: any
  }
} = {
  customers: {
    search: null,
    create: null,
    update: null,
  },
  subscriptions: {
    create: null,
    retrieve: null,
    list: null,
  },
}

const mockFetch = mock(() => Promise.resolve(new Response()))

mock.module('../db/repo.js', () => {
  return {
    TrialsRepository: {
      getByUserId: async (userId: string) => {
        if (mockTrialsRepo.shouldThrow === 'getByUserId') {
          mockTrialsRepo.shouldThrow = null
          throw new Error('Database error')
        }
        if (mockTrialsRepo.getByUserId === null) {
          return null
        }
        if (typeof mockTrialsRepo.getByUserId === 'function') {
          return mockTrialsRepo.getByUserId(userId)
        }
        return mockTrialsRepo.getByUserId
      },
      upsertFromStripeSubscription: async (
        userId: string,
        subscriptionId: string,
        trialStartAt: Date | null,
        hasCompletedTrial: boolean,
        trialEndAt?: Date | null,
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
            trial_end_at: trialEndAt ?? null,
            has_completed_trial: hasCompletedTrial,
          }
        }
        if (typeof mockTrialsRepo.upsertFromStripeSubscription === 'function') {
          return mockTrialsRepo.upsertFromStripeSubscription(
            userId,
            subscriptionId,
            trialStartAt,
            hasCompletedTrial,
            trialEndAt,
          )
        }
        return mockTrialsRepo.upsertFromStripeSubscription
      },
      completeTrial: async (userId: string) => {
        if (mockTrialsRepo.shouldThrow === 'completeTrial') {
          mockTrialsRepo.shouldThrow = null
          throw new Error('Database error')
        }
        if (mockTrialsRepo.completeTrial === null) {
          return {
            user_id: userId,
            trial_start_at: null,
            has_completed_trial: true,
          }
        }
        if (typeof mockTrialsRepo.completeTrial === 'function') {
          return mockTrialsRepo.completeTrial(userId)
        }
        return mockTrialsRepo.completeTrial
      },
    },
    SubscriptionsRepository: {
      getByUserId: async (userId: string) => {
        if (mockSubscriptionsRepo.getByUserId === null) {
          return null
        }
        if (typeof mockSubscriptionsRepo.getByUserId === 'function') {
          return mockSubscriptionsRepo.getByUserId(userId)
        }
        return mockSubscriptionsRepo.getByUserId
      },
    },
  }
})

mock.module('stripe', () => {
  return {
    default: class MockStripe {
      customers = {
        search: mockStripe.customers.search || (async () => ({ data: [] })),
        create:
          mockStripe.customers.create ||
          (async () => ({ id: 'cus_test123', email: null, name: null })),
        update:
          mockStripe.customers.update ||
          (async () => ({ id: 'cus_test123', email: null, name: null })),
      }
      subscriptions = {
        create:
          mockStripe.subscriptions.create ||
          (async () => {
            const now = Math.floor(Date.now() / 1000)
            const trialEnd = now + 14 * 24 * 60 * 60
            return {
              id: 'sub_test123',
              status: 'trialing',
              trial_start: now,
              trial_end: trialEnd,
              items: { data: [{ price: { id: 'price_test123' } }] },
            }
          }),
        retrieve:
          mockStripe.subscriptions.retrieve ||
          (async () => {
            const now = Math.floor(Date.now() / 1000)
            const trialEnd = now + 14 * 24 * 60 * 60
            return {
              id: 'sub_test123',
              status: 'trialing',
              trial_start: now,
              trial_end: trialEnd,
              items: { data: [{ price: { id: 'price_test123' } }] },
            }
          }),
        list: mockStripe.subscriptions.list || (async () => ({ data: [] })),
      }
    },
  }
})

// Mock fetch for Auth0 API calls
global.fetch = mockFetch as any

import { registerTrialRoutes } from './trial.js'

describe('registerTrialRoutes', () => {
  const envReset = createEnvReset()

  beforeEach(() => {
    mockTrialsRepo.getByUserId = null
    mockTrialsRepo.upsertFromStripeSubscription = null
    mockTrialsRepo.completeTrial = null
    mockTrialsRepo.shouldThrow = null
    mockSubscriptionsRepo.getByUserId = null
    mockStripe.customers.search = null
    mockStripe.customers.create = null
    mockStripe.customers.update = null
    mockStripe.subscriptions.create = null
    mockStripe.subscriptions.retrieve = null
    mockStripe.subscriptions.list = null
    mockFetch.mockClear()

    // Set up default environment variables
    envReset.set({
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PRICE_ID: 'price_test123',
      AUTH0_DOMAIN: 'test.auth0.com',
      AUTH0_MGMT_CLIENT_ID: 'test_client_id',
      AUTH0_MGMT_CLIENT_SECRET: 'test_client_secret',
    })

    // Mock Auth0 Management API calls
    mockFetch.mockImplementation((url: string | Request | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/oauth/token')) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'mock_token' }), {
            status: 200,
          }),
        )
      }
      if (urlStr.includes('/api/v2/users/')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              email: 'test@example.com',
              name: 'Test User',
            }),
            { status: 200 },
          ),
        )
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    })
  })

  afterEach(() => {
    envReset.reset()
  })

  describe('POST /trial/start', () => {
    it('returns 401 when requireAuth is true and user is missing', async () => {
      const app = createTestApp()
      await registerTrialRoutes(app, { requireAuth: true })

      const res = await app.inject({
        method: 'POST',
        url: '/trial/start',
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Unauthorized')
      await app.close()
    })

    it('returns 500 when Stripe is not configured', async () => {
      envReset.set({
        STRIPE_SECRET_KEY: undefined,
        STRIPE_PRICE_ID: undefined,
      })
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      const res = await app.inject({
        method: 'POST',
        url: '/trial/start',
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Stripe not configured')
      await app.close()
    })

    it('returns existing trial status when user already has a subscription', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      const trialStartAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      mockTrialsRepo.getByUserId = {
        user_id: 'user-123',
        stripe_subscription_id: 'sub_existing123',
        trial_start_at: trialStartAt,
        has_completed_trial: false,
      }

      const now = Math.floor(Date.now() / 1000)
      const trialEnd = now + 9 * 24 * 60 * 60
      mockStripe.subscriptions.retrieve = async () => ({
        id: 'sub_existing123',
        status: 'trialing',
        trial_start: Math.floor(trialStartAt.getTime() / 1000),
        trial_end: trialEnd,
        items: { data: [{ price: { id: 'price_test123' } }] },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/trial/start',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.trialDays).toBe(14)
      expect(body.daysLeft).toBeGreaterThan(0)
      expect(body.daysLeft).toBeLessThanOrEqual(14)
      expect(body.isTrialActive).toBe(true)
      expect(body.hasCompletedTrial).toBe(false)
      await app.close()
    })

    it('returns completed trial status when trial is already completed', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      mockTrialsRepo.getByUserId = {
        user_id: 'user-123',
        stripe_subscription_id: null,
        trial_start_at: null,
        has_completed_trial: true,
      }

      const res = await app.inject({
        method: 'POST',
        url: '/trial/start',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.trialDays).toBe(14)
      expect(body.trialStartAt).toBe(null)
      expect(body.daysLeft).toBe(0)
      expect(body.isTrialActive).toBe(false)
      expect(body.hasCompletedTrial).toBe(true)
      await app.close()
    })

    it('creates new trial subscription successfully', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      mockTrialsRepo.getByUserId = null // No existing trial
      mockSubscriptionsRepo.getByUserId = null // No existing subscription
      mockStripe.customers.search = async () => ({ data: [] }) // No existing customer
      mockStripe.customers.create = async () => ({
        id: 'cus_new123',
        email: 'test@example.com',
        name: 'Test User',
      })
      mockStripe.subscriptions.list = async () => ({ data: [] }) // No existing subscriptions

      const now = Math.floor(Date.now() / 1000)
      const trialEnd = now + 14 * 24 * 60 * 60
      mockStripe.subscriptions.create = async () => ({
        id: 'sub_new123',
        status: 'trialing',
        trial_start: now,
        trial_end: trialEnd,
        items: { data: [{ price: { id: 'price_test123' } }] },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/trial/start',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.trialDays).toBe(14)
      expect(body.daysLeft).toBe(14)
      expect(body.isTrialActive).toBe(true)
      expect(body.hasCompletedTrial).toBe(false)
      await app.close()
    })

    it('uses existing Stripe customer when found', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      mockTrialsRepo.getByUserId = null
      mockSubscriptionsRepo.getByUserId = null
      mockStripe.customers.search = async () => ({
        data: [{ id: 'cus_existing123' }],
      })
      mockStripe.subscriptions.list = async () => ({ data: [] }) // No existing subscriptions

      const now = Math.floor(Date.now() / 1000)
      const trialEnd = now + 14 * 24 * 60 * 60
      mockStripe.subscriptions.create = async () => ({
        id: 'sub_new123',
        status: 'trialing',
        trial_start: now,
        trial_end: trialEnd,
        items: { data: [{ price: { id: 'price_test123' } }] },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/trial/start',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      await app.close()
    })

    it('handles database errors gracefully', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      mockTrialsRepo.shouldThrow = 'getByUserId'

      const res = await app.inject({
        method: 'POST',
        url: '/trial/start',
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Database error')
      await app.close()
    })

    it('handles upsert errors gracefully', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      mockTrialsRepo.getByUserId = null
      mockSubscriptionsRepo.getByUserId = null
      mockStripe.customers.search = async () => ({ data: [] })
      mockStripe.customers.create = async () => ({
        id: 'cus_new123',
      })
      mockStripe.subscriptions.list = async () => ({ data: [] }) // No existing subscriptions

      const now = Math.floor(Date.now() / 1000)
      const trialEnd = now + 14 * 24 * 60 * 60
      mockStripe.subscriptions.create = async () => ({
        id: 'sub_new123',
        status: 'trialing',
        trial_start: now,
        trial_end: trialEnd,
        items: { data: [{ price: { id: 'price_test123' } }] },
      })

      mockTrialsRepo.shouldThrow = 'upsertFromStripeSubscription'

      const res = await app.inject({
        method: 'POST',
        url: '/trial/start',
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Database error')
      await app.close()
    })
  })

  describe('POST /trial/complete', () => {
    it('returns 401 when requireAuth is true and user is missing', async () => {
      const app = createTestApp()
      await registerTrialRoutes(app, { requireAuth: true })

      const res = await app.inject({
        method: 'POST',
        url: '/trial/complete',
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Unauthorized')
      await app.close()
    })

    it('completes trial successfully when authenticated', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      mockTrialsRepo.completeTrial = {
        user_id: 'user-123',
        trial_start_at: null,
        has_completed_trial: true,
      }

      const res = await app.inject({
        method: 'POST',
        url: '/trial/complete',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.trialDays).toBe(14)
      expect(body.trialStartAt).toBe(null)
      expect(body.daysLeft).toBe(0)
      expect(body.isTrialActive).toBe(false)
      expect(body.hasCompletedTrial).toBe(true)
      await app.close()
    })

    it('handles errors gracefully', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      mockTrialsRepo.shouldThrow = 'completeTrial'

      const res = await app.inject({
        method: 'POST',
        url: '/trial/complete',
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Database error')
      await app.close()
    })

    it('handles errors with no message', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      mockTrialsRepo.completeTrial = () => {
        throw new Error()
      }

      const res = await app.inject({
        method: 'POST',
        url: '/trial/complete',
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Server error')
      await app.close()
    })
  })
})
