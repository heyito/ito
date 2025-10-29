import type { FastifyInstance } from 'fastify'
import { TrialsRepository } from '../db/repo.js'

const TRIAL_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

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

  fastify.post('/trial/start', async (request, reply) => {
    try {
      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      const row = await TrialsRepository.startTrial(userSub)
      reply.send(computeStatus(row))
    } catch (error: any) {
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })

  fastify.get('/trial/status', async (request, reply) => {
    try {
      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }
      const row =
        (await TrialsRepository.getByUserId(userSub)) ||
        (await TrialsRepository.startTrial(userSub)) // ensure a row exists for status

      reply.send(computeStatus(row))
    } catch (error: any) {
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
