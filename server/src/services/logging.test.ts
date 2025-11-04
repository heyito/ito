import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import {
  type AnyObject,
  createTestApp,
  addAuthHook,
} from './__tests__/helpers.js'

// Mock the AWS SDK module used by logging.ts before importing the module under test
const awsMockState: {
  putShouldThrowInvalidTokenOnce: boolean
  sends: AnyObject[]
} = {
  putShouldThrowInvalidTokenOnce: false,
  sends: [],
}

mock.module('@aws-sdk/client-cloudwatch-logs', () => {
  class CreateLogStreamCommand {
    input: AnyObject
    constructor(input: AnyObject) {
      this.input = input
    }
  }
  class DescribeLogStreamsCommand {
    input: AnyObject
    constructor(input: AnyObject) {
      this.input = input
    }
  }
  class PutLogEventsCommand {
    input: AnyObject
    constructor(input: AnyObject) {
      this.input = input
    }
  }
  class CloudWatchLogsClient {
    async send(command: any): Promise<any> {
      awsMockState.sends.push({
        type: command.constructor.name,
        input: command.input,
      })
      if (command instanceof DescribeLogStreamsCommand) {
        return { logStreams: [{ uploadSequenceToken: 'token-from-describe' }] }
      }
      if (command instanceof PutLogEventsCommand) {
        if (awsMockState.putShouldThrowInvalidTokenOnce) {
          awsMockState.putShouldThrowInvalidTokenOnce = false
          const err = new Error('Invalid sequence token') as any
          err.name = 'InvalidSequenceTokenException'
          throw err
        }
        return { nextSequenceToken: 'next-token' }
      }
      // CreateLogStreamCommand success result
      return {}
    }
  }
  return {
    CloudWatchLogsClient,
    CreateLogStreamCommand,
    PutLogEventsCommand,
    DescribeLogStreamsCommand,
    __awsMockState: awsMockState,
  }
})

// Import after mocks are in place
import { registerLoggingRoutes } from './logging.js'

const originalStdoutWrite = process.stdout.write

describe('registerLoggingRoutes', () => {
  beforeEach(() => {
    // reset mocks
    const { __awsMockState } =
      require('@aws-sdk/client-cloudwatch-logs') as AnyObject
    __awsMockState.putShouldThrowInvalidTokenOnce = false
    __awsMockState.sends.length = 0
  })

  afterEach(() => {
    process.stdout.write = originalStdoutWrite
  })

  it('returns 400 for invalid body', async () => {
    const app = createTestApp()
    await registerLoggingRoutes(app, {
      requireAuth: false,
      showClientLogs: true,
      clientLogGroupName: null,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/logs',
      payload: { bad: true } as any,
    })

    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('falls back to stdout when no log group configured', async () => {
    const writes: string[] = []
    process.stdout.write = mock((chunk: string | Uint8Array) => {
      writes.push(chunk.toString())
      return true
    }) as any

    const app = createTestApp()
    // Add a hook to simulate authenticated user when requireAuth is true; here false so ignored
    await registerLoggingRoutes(app, {
      requireAuth: false,
      showClientLogs: true,
      clientLogGroupName: null,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/logs',
      payload: {
        events: [
          { ts: Date.now(), level: 'info', message: 'hello', source: 'test' },
          {
            ts: Date.now() + 1,
            level: 'debug',
            message: 'world',
            fields: { a: 1 },
          },
        ],
      },
    })

    expect(res.statusCode).toBe(204)
    expect(writes.length).toBe(2)
    // Ensure the logged JSON is valid and contains expected fields
    for (const line of writes) {
      const json = JSON.parse(line)
      expect(json).toHaveProperty('message')
      expect(json).toHaveProperty('level')
      expect(json.source).toBeDefined()
    }

    await app.close()
  })

  it('initializes CloudWatch stream and sends events (happy path)', async () => {
    const app = createTestApp()
    await registerLoggingRoutes(app, {
      requireAuth: true,
      showClientLogs: true,
      clientLogGroupName: 'my-log-group',
    })

    const { __awsMockState } =
      require('@aws-sdk/client-cloudwatch-logs') as AnyObject

    const earlyCalls = __awsMockState.sends.map((c: AnyObject) => c.type)
    // ensureStream is called during registration
    expect(earlyCalls).toEqual([
      'CreateLogStreamCommand',
      'DescribeLogStreamsCommand',
    ])

    // Add a hook to simulate user info when auth is required
    addAuthHook(app)

    const res = await app.inject({
      method: 'POST',
      url: '/logs',
      payload: {
        events: [
          { ts: 2, level: 'info', message: 'b' },
          { ts: 1, level: 'debug', message: 'a' },
        ],
      },
    })

    expect(res.statusCode).toBe(204)

    // Verify a PutLogEvents was sent with sorted events and sequence token
    const putCalls = __awsMockState.sends.filter(
      (c: AnyObject) => c.type === 'PutLogEventsCommand',
    )
    expect(putCalls).toHaveLength(1)
    const putInput = putCalls[0].input
    expect(putInput.logGroupName).toBe('my-log-group')
    expect(Array.isArray(putInput.logEvents)).toBe(true)
    expect(putInput.logEvents.map((e: any) => e.timestamp)).toEqual([1, 2])
    expect(putInput.sequenceToken).toBe('token-from-describe')

    await app.close()
  })

  it('retries once on InvalidSequenceTokenException', async () => {
    const app = createTestApp()
    await registerLoggingRoutes(app, {
      requireAuth: false,
      showClientLogs: true,
      clientLogGroupName: 'retry-group',
    })

    const { __awsMockState } =
      require('@aws-sdk/client-cloudwatch-logs') as AnyObject
    __awsMockState.putShouldThrowInvalidTokenOnce = true

    const res = await app.inject({
      method: 'POST',
      url: '/logs',
      payload: {
        events: [
          { ts: 5, level: 'info', message: 'x' },
          { ts: 4, level: 'warn', message: 'y' },
        ],
      },
    })

    expect(res.statusCode).toBe(204)

    const calls = __awsMockState.sends.map((c: AnyObject) => c.type)
    // Registration ensureStream + first failing Put + ensureStream (create+describe) + second Put
    expect(calls).toEqual([
      'CreateLogStreamCommand',
      'DescribeLogStreamsCommand',
      'PutLogEventsCommand',
      'CreateLogStreamCommand',
      'DescribeLogStreamsCommand',
      'PutLogEventsCommand',
    ])

    await app.close()
  })

  it('coerces unknown levels to info', async () => {
    const writes: string[] = []
    process.stdout.write = mock((chunk: string | Uint8Array) => {
      writes.push(chunk.toString())
      return true
    }) as any

    const app = createTestApp()
    await registerLoggingRoutes(app, {
      requireAuth: false,
      showClientLogs: true,
      clientLogGroupName: null,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/logs',
      payload: {
        events: [
          // cast as any to bypass compile-time union
          { ts: Date.now(), level: 'silly', message: 'noise' } as any,
        ],
      },
    })
    expect(res.statusCode).toBe(204)
    const json = JSON.parse(writes[0])
    expect(json.level).toBe('info')
    await app.close()
  })
})
