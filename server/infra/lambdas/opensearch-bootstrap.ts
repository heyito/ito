import https from 'https'

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

function request(path: string, method: string, body?: any): Promise<any> {
  const data = body ? JSON.stringify(body) : undefined
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: DOMAIN_ENDPOINT,
        path,
        method,
        headers: {
          'content-type': 'application/json',
          'content-length': data ? Buffer.byteLength(data) : 0,
        },
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const s = Buffer.concat(chunks).toString('utf8')
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
        fields: { type: 'flattened' },
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
        fields: { type: 'flattened' },
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

  // Apply ISM policy for both patterns
  await request('/_plugins/_ism/policies/ito-retain-forever', 'PUT', ismPolicy)

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

  return { status: 'ok' }
}
