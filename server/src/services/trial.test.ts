import { describe, it, expect, mock, beforeEach } from 'bun:test'
import {
  type AnyObject,
  createTestAppWithAuth,
  createTestApp,
} from './__tests__/helpers.js'

const mockTrialsRepo: {
  startTrial: AnyObject | null
  completeTrial: AnyObject | null
  shouldThrow: string | null
} = {
  startTrial: null,
  completeTrial: null,
  shouldThrow: null,
}

mock.module('../db/repo.js', () => {
  return {
    TrialsRepository: {
      startTrial: async (userId: string) => {
        if (mockTrialsRepo.shouldThrow === 'startTrial') {
          mockTrialsRepo.shouldThrow = null
          throw new Error('Database error')
        }
        if (mockTrialsRepo.startTrial === null) {
          return {
            user_id: userId,
            trial_start_at: new Date(),
            has_completed_trial: false,
          }
        }
        if (typeof mockTrialsRepo.startTrial === 'function') {
          return mockTrialsRepo.startTrial(userId)
        }
        return mockTrialsRepo.startTrial
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
  }
})

import { registerTrialRoutes } from './trial.js'

describe('registerTrialRoutes', () => {
  beforeEach(() => {
    mockTrialsRepo.startTrial = null
    mockTrialsRepo.completeTrial = null
    mockTrialsRepo.shouldThrow = null
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

    it('starts trial successfully when authenticated', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      const trialStartAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      mockTrialsRepo.startTrial = {
        user_id: 'user-123',
        trial_start_at: trialStartAt,
        has_completed_trial: false,
      }

      const res = await app.inject({
        method: 'POST',
        url: '/trial/start',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.trialDays).toBe(14)
      expect(body.trialStartAt).toBe(trialStartAt.toISOString())
      expect(body.daysLeft).toBeGreaterThan(0)
      expect(body.daysLeft).toBeLessThanOrEqual(14)
      expect(body.isTrialActive).toBe(true)
      expect(body.hasCompletedTrial).toBe(false)
      await app.close()
    })

    it('returns correct status for newly started trial', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      const now = new Date()
      mockTrialsRepo.startTrial = {
        user_id: 'user-123',
        trial_start_at: now,
        has_completed_trial: false,
      }

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

    it('returns correct status for expired trial', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      const trialStartAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
      mockTrialsRepo.startTrial = {
        user_id: 'user-123',
        trial_start_at: trialStartAt,
        has_completed_trial: false,
      }

      const res = await app.inject({
        method: 'POST',
        url: '/trial/start',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.trialDays).toBe(14)
      expect(body.daysLeft).toBe(0)
      expect(body.isTrialActive).toBe(false)
      expect(body.hasCompletedTrial).toBe(false)
      await app.close()
    })

    it('returns correct status when trial is already completed', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      mockTrialsRepo.startTrial = {
        user_id: 'user-123',
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

    it('handles errors gracefully', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      mockTrialsRepo.shouldThrow = 'startTrial'

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

    it('handles errors with no message', async () => {
      const app = createTestAppWithAuth()
      await registerTrialRoutes(app, { requireAuth: true })

      mockTrialsRepo.startTrial = () => {
        throw new Error()
      }

      const res = await app.inject({
        method: 'POST',
        url: '/trial/start',
      })

      expect(res.statusCode).toBe(500)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(false)
      expect(body.error).toBe('Server error')
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
