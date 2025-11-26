import type { FastifyInstance } from 'fastify'

type SendVerificationBody = {
  dbUserId?: string
  clientId?: string
}

type ResetPasswordBody = {
  email?: string
  connection?: string
}

export const registerAuth0Routes = async (fastify: FastifyInstance) => {
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
  const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID
  const AUTH0_MGMT_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID
  const AUTH0_MGMT_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET

  if (!AUTH0_DOMAIN) {
    fastify.log.error('AUTH0_DOMAIN is not set')
  }
  if (!AUTH0_CLIENT_ID) {
    fastify.log.warn(
      'AUTH0_CLIENT_ID is not set; reset-password route will fail',
    )
  }
  if (!AUTH0_MGMT_CLIENT_ID || !AUTH0_MGMT_CLIENT_SECRET) {
    fastify.log.warn(
      'Auth0 management client credentials are not fully set; management routes will fail',
    )
  }

  const getManagementToken = async (): Promise<string | null> => {
    if (!AUTH0_DOMAIN || !AUTH0_MGMT_CLIENT_ID || !AUTH0_MGMT_CLIENT_SECRET)
      return null
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
        throw new Error(
          data?.error_description || 'Failed to get management token',
        )
      }
      return data.access_token as string
    } catch (err) {
      fastify.log.error({ err }, '[Auth0] getManagementToken error')
      return null
    }
  }

  fastify.post('/auth0/send-verification', async (request, reply) => {
    const body = (request.body as SendVerificationBody) || {}
    const dbUserId = body.dbUserId
    const clientId = body.clientId
    if (!dbUserId) {
      reply
        .status(400)
        .send({ success: false, error: 'Missing user identifier' })
      return
    }

    const token = await getManagementToken()
    if (!token) {
      reply
        .status(500)
        .send({ success: false, error: 'Missing management token' })
      return
    }

    try {
      const url = `https://${AUTH0_DOMAIN}/api/v2/jobs/verification-email`
      const payload: any = {
        user_id: dbUserId,
      }
      if (clientId) payload.client_id = clientId
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      let data: any
      try {
        data = await res.json()
      } catch {
        data = undefined
      }
      if (!res.ok) {
        const message =
          data?.message ||
          data?.error_description ||
          data?.error ||
          `Verification request failed (${res.status})`
        reply.status(res.status).send({ success: false, error: message })
        return
      }
      reply.send({ success: true, jobId: data?.id || data?.job_id || null })
    } catch (error: any) {
      reply
        .status(500)
        .send({ success: false, error: error?.message || 'Network error' })
    }
  })

  fastify.get('/auth0/users-by-email', async (request, reply) => {
    const { email } = (request.query as { email?: string }) || {}
    if (!email) {
      reply.status(400).send({ success: false, error: 'Missing email' })
      return
    }

    const token = await getManagementToken()
    if (!token) {
      reply
        .status(500)
        .send({ success: false, error: 'Missing management token' })
      return
    }

    try {
      const url = `https://${AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(
        email,
      )}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data: any = await res.json()
      if (!res.ok) {
        const message =
          data?.message || data?.error || `Lookup failed (${res.status})`
        reply.status(res.status).send({ success: false, error: message })
        return
      }

      const user = Array.isArray(data)
        ? data.find(
            (u: any) =>
              u?.email?.toLowerCase() === email.toLowerCase() &&
              typeof u?.user_id === 'string' &&
              u.user_id.startsWith('auth0|'),
          )
        : null

      if (!user) {
        reply.send({ success: true, exists: false, verified: false })
        return
      }

      reply.send({
        success: true,
        exists: true,
        verified: !!user.email_verified,
        dbUserId: typeof user.user_id === 'string' ? user.user_id : null,
      })
    } catch (error: any) {
      reply
        .status(500)
        .send({ success: false, error: error?.message || 'Network error' })
    }
  })

  fastify.post('/auth0/reset-password', async (request, reply) => {
    const body = (request.body as ResetPasswordBody) || {}
    const { email, connection = 'Username-Password-Authentication' } = body

    if (!email) {
      reply.status(400).send({ success: false, error: 'Missing email' })
      return
    }
    if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
      reply.status(500).send({ success: false, error: 'Auth0 not configured' })
      return
    }

    try {
      const url = `https://${AUTH0_DOMAIN}/dbconnections/change_password`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: AUTH0_CLIENT_ID,
          email,
          connection,
        }),
      })

      if (res.ok) {
        reply.send({ success: true })
        return
      }

      let data: any
      try {
        data = await res.json()
      } catch {
        data = { error: await res.text() }
      }
      const message =
        data?.error_description || data?.error || `Reset failed (${res.status})`
      reply.status(res.status).send({ success: false, error: message })
    } catch (error: any) {
      reply
        .status(500)
        .send({ success: false, error: error?.message || 'Network error' })
    }
  })
}
