import https from 'https'
import crypto from 'crypto'

type Event = {
  RequestType: 'Create' | 'Update' | 'Delete'
}

const DOMAIN_ENDPOINT = process.env.DOMAIN_ENDPOINT!
const REGION = process.env.REGION || 'us-west-2'
const STAGE = process.env.STAGE || 'dev'
const isDev = STAGE === 'dev'

const templateSettings = {
  number_of_shards: 1,
  number_of_replicas: isDev ? 0 : 1,
}

const rollover = {
  min_index_age: '1d',
  min_size: isDev ? '5gb' : '20gb',
}

// Minimal SigV4 signer for OpenSearch HTTP requests
function signRequest(
  method: string,
  path: string,
  body: string,
  now: Date,
  creds: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  },
) {
  const service = 'es'
  const amzDate =
    now.toISOString().replace(/[:-]|/g, '').replace(/\..+/, '') + 'Z'
  const date = amzDate.slice(0, 8)
  const canonicalUri = path
  const canonicalQuerystring = ''
  const payloadHash = crypto
    .createHash('sha256')
    .update(body || '', 'utf8')
    .digest('hex')
  const canonicalHeaders =
    `host:${DOMAIN_ENDPOINT}\n` + `x-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-date'
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${date}/${REGION}/${service}/aws4_request`
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
  ].join('\n')

  const kDate = crypto
    .createHmac('sha256', 'AWS4' + creds.secretAccessKey)
    .update(date)
    .digest()
  const kRegion = crypto.createHmac('sha256', kDate).update(REGION).digest()
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest()
  const kSigning = crypto
    .createHmac('sha256', kService)
    .update('aws4_request')
    .digest()
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex')

  const authorizationHeader = `${algorithm} Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-amz-date': amzDate,
    Authorization: authorizationHeader,
  }
  if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken
  return headers
}

function request(path: string, method: string, body?: any): Promise<any> {
  const data = body ? JSON.stringify(body) : ''
  const now = new Date()
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const sessionToken = process.env.AWS_SESSION_TOKEN
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Missing AWS credentials for signing OpenSearch requests')
  }
  const headers = signRequest(method, path, data, now, {
    accessKeyId,
    secretAccessKey,
    sessionToken,
  })
  if (data) {
    headers['content-length'] = Buffer.byteLength(data).toString()
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: DOMAIN_ENDPOINT,
        path,
        method,
        headers,
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const s = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 400) {
            return reject(
              new Error(`OpenSearch HTTP ${res.statusCode}: ${s || 'no body'}`),
            )
          }
          try {
            resolve(s ? JSON.parse(s) : {})
          } catch {
            resolve({})
          }
        })
      },
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

const clientTemplate = {
  index_patterns: ['client-logs-*'],
  template: {
    settings: { index: templateSettings },
    mappings: {
      dynamic: false,
      properties: {
        '@timestamp': { type: 'date' },
        'log.level': { type: 'keyword' },
        message: {
          type: 'text',
          fields: { keyword: { type: 'keyword', ignore_above: 1024 } },
        },
        'event.dataset': { type: 'keyword' },
        stage: { type: 'keyword' },
        'service.name': { type: 'keyword' },
        'service.version': { type: 'keyword' },
        'log.group': { type: 'keyword' },
        'log.stream': { type: 'keyword' },
        'trace.id': { type: 'keyword' },
        'span.id': { type: 'keyword' },
        'interaction.id': { type: 'keyword' },
        platform: { type: 'keyword' },
        'user.sub': { type: 'keyword' },
        fields: { type: 'object', enabled: false },
      },
    },
  },
}

const serverTemplate = {
  index_patterns: ['server-logs-*'],
  template: {
    settings: { index: templateSettings },
    mappings: {
      dynamic: false,
      properties: {
        '@timestamp': { type: 'date' },
        'log.level': { type: 'keyword' },
        message: {
          type: 'text',
          fields: { keyword: { type: 'keyword', ignore_above: 1024 } },
        },
        'event.dataset': { type: 'keyword' },
        stage: { type: 'keyword' },
        'service.name': { type: 'keyword' },
        'service.version': { type: 'keyword' },
        'log.group': { type: 'keyword' },
        'log.stream': { type: 'keyword' },
        fields: { type: 'object', enabled: false },
      },
    },
  },
}

const timingAnalyticsTemplate = {
  index_patterns: ['ito-timing-analytics-*'],
  template: {
    settings: { index: templateSettings },
    mappings: {
      dynamic: false,
      properties: {
        '@timestamp': { type: 'date' },
        'event.dataset': { type: 'keyword' },
        interaction_id: { type: 'keyword' },
        user_id: { type: 'keyword' },
        stage: { type: 'keyword' },
        data_completeness: { type: 'keyword' }, // 'both', 'client_only', 'server_only'
        client_received_at: { type: 'date' },
        server_received_at: { type: 'date' },

        // Client-specific metadata
        client_metadata: {
          type: 'object',
          properties: {
            platform: { type: 'keyword' },
            app_version: { type: 'keyword' },
            hostname: { type: 'keyword' },
          },
        },
        client_total_duration_ms: { type: 'integer' },

        // Server-specific metadata
        server_metadata: {
          type: 'object',
          properties: {
            // Extensible for future server-specific fields
          },
        },
        server_total_duration_ms: { type: 'integer' },

        // Unified events array (nested for proper querying)
        events: {
          type: 'nested',
          properties: {
            source: { type: 'keyword' }, // 'client' or 'server'
            name: { type: 'keyword' },
            start_ms: { type: 'long' },
            end_ms: { type: 'long' },
            duration_ms: { type: 'integer' },
          },
        },
      },
    },
  },
}

// ISM policy to retain forever (no delete); rollover daily (or when large)
const ismPolicy = {
  policy: {
    description: 'Rollover daily, retain indefinitely',
    default_state: 'hot',
    states: [
      {
        name: 'hot',
        actions: [{ rollover }],
        transitions: [],
      },
    ],
  },
}

export const handler = async (_event: Event) => {
  // Templates
  await request('/_index_template/ito-client-logs', 'PUT', clientTemplate)
  await request('/_index_template/ito-server-logs', 'PUT', serverTemplate)
  await request(
    '/_index_template/ito-timing-analytics',
    'PUT',
    timingAnalyticsTemplate,
  )

  // Apply ISM policy for both patterns
  try {
    await request(
      '/_plugins/_ism/policies/ito-retain-forever',
      'PUT',
      ismPolicy,
    )
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : `${e}`
    if (!(msg.includes('HTTP 409') || msg.includes('"status":409'))) {
      throw e
    }
  }

  // Attach ISM policy via index template settings
  const addPolicy = (t: any) => ({
    ...t,
    template: {
      ...t.template,
      settings: {
        ...t.template.settings,
        'index.plugins.index_state_management.policy_id': 'ito-retain-forever',
      },
    },
  })
  await request(
    '/_index_template/ito-client-logs',
    'PUT',
    addPolicy(clientTemplate),
  )
  await request(
    '/_index_template/ito-server-logs',
    'PUT',
    addPolicy(serverTemplate),
  )
  await request(
    '/_index_template/ito-timing-analytics',
    'PUT',
    addPolicy(timingAnalyticsTemplate),
  )

  return { status: 'ok' }
}
