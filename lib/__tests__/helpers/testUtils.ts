import { mock } from 'bun:test'
import { install } from '@sinonjs/fake-timers'
import { afterAll, beforeEach } from 'bun:test'

export function fakeTimers() {
  const clock = install()

  beforeEach(() => {
    clock.reset()
  })

  afterAll(() => {
    clock.uninstall()
  })

  return clock
}

// Helper to create a mock module with all exports
export const createMockModule = (moduleExports: Record<string, any>) => {
  return mock(() => moduleExports)
}

// Helper to reset all mocks in an object
export const resetAllMocks = (mockObject: Record<string, any>) => {
  Object.values(mockObject).forEach(mockFn => {
    if (typeof mockFn === 'function' && mockFn.mockClear) {
      mockFn.mockClear()
    }
  })
}

// Helper to create a promise that resolves/rejects after a delay
export const createDelayedPromise = <T>(
  value: T,
  delay: number = 0,
  shouldReject: boolean = false,
): Promise<T> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldReject) {
        reject(value)
      } else {
        resolve(value)
      }
    }, delay)
  })
}

// Helper to create a mock function that tracks call order
export const createOrderedMock = () => {
  const calls: number[] = []
  let callCount = 0

  const mockFn = mock(() => {
    calls.push(++callCount)
    return callCount
  })

  return {
    mock: mockFn,
    calls,
    getCallOrder: () => calls,
    reset: () => {
      calls.length = 0
      callCount = 0
      mockFn.mockClear()
    },
  }
}

// Helper to suppress console output during tests
export const suppressConsole = (
  methods: ('log' | 'warn' | 'error' | 'info')[] = [
    'log',
    'warn',
    'error',
    'info',
  ],
) => {
  const originalMethods: Record<string, any> = {}

  const suppress = () => {
    methods.forEach(method => {
      // eslint-disable-next-line no-console
      originalMethods[method] = console[method]
      // eslint-disable-next-line no-console
      console[method] = mock()
    })
  }

  const restore = () => {
    methods.forEach(method => {
      if (originalMethods[method]) {
        // eslint-disable-next-line no-console
        console[method] = originalMethods[method]
      }
    })
  }

  return { suppress, restore }
}

// Helper for testing async functions with timeouts
export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
  timeoutMessage: string = 'Operation timed out',
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    }),
  ])
}

// Helper to create a mock that throws on specific call numbers
export const createThrowingMock = (throwOnCalls: number[] = []) => {
  let callCount = 0

  return mock(() => {
    callCount++
    if (throwOnCalls.includes(callCount)) {
      throw new Error(`Mock error on call ${callCount}`)
    }
    return `call-${callCount}`
  })
}

// Helper to create a spy that tracks arguments
export const createArgSpy = <T extends any[]>() => {
  const capturedArgs: T[] = []

  const spy = mock((...args: T) => {
    capturedArgs.push(args)
    return args
  })

  return {
    spy,
    capturedArgs,
    getArgs: (callIndex: number) => capturedArgs[callIndex],
    getAllArgs: () => capturedArgs,
    reset: () => {
      capturedArgs.length = 0
      spy.mockClear()
    },
  }
}
