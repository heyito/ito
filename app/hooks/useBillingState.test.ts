import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react'
import { Window } from 'happy-dom'

let window: Window
let document: any
let mockAddEventListener: ReturnType<typeof mock>
let mockRemoveEventListener: ReturnType<typeof mock>

const mockBillingApi = {
  status: mock(),
}

const mockTrialApi = {
  complete: mock(),
}

const mockApi = {
  billing: mockBillingApi,
  trial: mockTrialApi,
  send: mock(),
}

const mockElectronStore = {
  get: mock((key: string) => {
    if (key === 'auth') {
      return mockStoreData.auth
    }
    return {}
  }),
  set: mock(),
}

const mockStoreData: { auth: { billing?: any } } = {
  auth: {},
}

const originalWindow = globalThis.window

beforeEach(() => {
  window = new Window()
  document = window.document
  global.window = window as any
  global.document = document as any

  // Reset mock state
  mockStoreData.auth = {}
  mockBillingApi.status.mockClear()
  mockTrialApi.complete.mockClear()
  mockApi.send.mockClear()
  mockElectronStore.get.mockClear()

  // Create fresh mocks for event listeners
  mockAddEventListener = mock((event: string, handler: () => void) => {})
  mockRemoveEventListener = mock((event: string, handler: () => void) => {})

  // Setup window mocks with addEventListener/removeEventListener
  globalThis.window = {
    ...window,
    addEventListener: mockAddEventListener as any,
    removeEventListener: mockRemoveEventListener as any,
    api: mockApi as any,
    electron: {
      store: mockElectronStore as any,
    },
  } as any
})

afterEach(() => {
  globalThis.window = originalWindow
})

// Simple test utility to render a hook
function renderHook<T>(hook: () => T): {
  result: { current: T }
  rerender: () => void
  unmount: () => void
  waitFor: (fn: () => boolean, timeout?: number) => Promise<void>
} {
  const result: { current: T } = { current: null as any }
  let root: Root | null = null
  let container: any = null

  const TestComponent = () => {
    const hookResult = hook()
    result.current = hookResult
    return null
  }

  const mount = () => {
    container = document.createElement('div')
    root = createRoot(container)

    act(() => {
      root!.render(React.createElement(TestComponent))
    })

    // Wait for initial render to complete
    return new Promise<void>(resolve => {
      setTimeout(() => resolve(), 0)
    })
  }

  // Mount synchronously wrapped in act
  mount()

  const rerender = () => {
    if (root && container) {
      act(() => {
        root!.render(React.createElement(TestComponent))
      })
    }
  }

  const unmount = () => {
    if (root) {
      act(() => {
        root?.unmount()
      })
      root = null
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
    container = null
  }

  const waitFor = async (fn: () => boolean, timeout = 1000): Promise<void> => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      // Ensure result.current is not null before checking
      if (result.current !== null && fn()) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error('waitFor timeout')
  }

  return { result, rerender, unmount, waitFor }
}

import { useBillingState } from './useBillingState'

describe('useBillingState', () => {
  it('initializes with loading state and no cached data', async () => {
    mockBillingApi.status.mockResolvedValue({
      success: true,
      pro_status: 'none' as const,
      trial: {
        trialDays: 14,
        trialStartAt: null,
        daysLeft: 0,
        isTrialActive: false,
        hasCompletedTrial: false,
      },
    })

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(null)
    expect(result.current.proStatus).toBe('none')
    expect(result.current.isPro).toBe(false)
    expect(mockBillingApi.status).toHaveBeenCalledTimes(1)
  })

  it('loads cached billing state from electron store', async () => {
    const cachedState = {
      proStatus: 'free_trial' as const,
      subscriptionStartAt: '2024-01-01T00:00:00.000Z',
      trialDays: 14,
      trialStartAt: '2024-01-01T00:00:00.000Z',
      daysLeft: 10,
      isTrialActive: true,
      hasCompletedTrial: false,
    }

    mockStoreData.auth.billing = cachedState

    // Mock API response to match cached state (refresh() will be called after mount)
    mockBillingApi.status.mockResolvedValue({
      success: true,
      pro_status: 'free_trial' as const,
      trial: {
        trialDays: 14,
        trialStartAt: '2024-01-01T00:00:00.000Z',
        daysLeft: 10,
        isTrialActive: true,
        hasCompletedTrial: false,
      },
    })

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(result.current.proStatus).toBe('free_trial')
    expect(result.current.isTrialActive).toBe(true)
    expect(result.current.daysLeft).toBe(10)
  })

  it('handles successful billing status fetch', async () => {
    const mockResponse = {
      success: true,
      pro_status: 'active_pro' as const,
      subscriptionStartAt: '2024-01-01T00:00:00.000Z',
      trial: {
        trialDays: 14,
        trialStartAt: null,
        daysLeft: 0,
        isTrialActive: false,
        hasCompletedTrial: true,
      },
    }

    mockBillingApi.status.mockResolvedValue(mockResponse)

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(result.current.proStatus).toBe('active_pro')
    expect(result.current.isPro).toBe(true)
    expect(result.current.hasSubscription).toBe(true)
    expect(result.current.error).toBe(null)
    expect(result.current.subscriptionStartAt).toBeInstanceOf(Date)
    expect(mockApi.send).toHaveBeenCalledWith(
      'electron-store-set',
      'auth.billing',
      expect.objectContaining({
        proStatus: 'active_pro',
      }),
    )
  })

  it('handles billing status fetch error', async () => {
    mockBillingApi.status.mockResolvedValue({
      success: false,
      error: 'API error',
    })

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(result.current.error).toBe('API error')
    expect(result.current.proStatus).toBe('none')
  })

  it('handles billing status fetch exception', async () => {
    const error = new Error('Network error')
    mockBillingApi.status.mockRejectedValue(error)

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(result.current.error).toBe('Network error')
    expect(result.current.proStatus).toBe('none')
  })

  it('refresh function updates billing state', async () => {
    const initialResponse = {
      success: true,
      pro_status: 'none' as const,
      trial: {
        trialDays: 14,
        trialStartAt: null,
        daysLeft: 0,
        isTrialActive: false,
        hasCompletedTrial: false,
      },
    }

    const updatedResponse = {
      success: true,
      pro_status: 'active_pro' as const,
      subscriptionStartAt: '2024-01-01T00:00:00.000Z',
      trial: {
        trialDays: 14,
        trialStartAt: null,
        daysLeft: 0,
        isTrialActive: false,
        hasCompletedTrial: true,
      },
    }

    mockBillingApi.status.mockResolvedValueOnce(initialResponse)
    mockBillingApi.status.mockResolvedValueOnce(updatedResponse)

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(result.current.proStatus).toBe('none')

    await result.current.refresh()

    await waitFor(() => result.current.proStatus === 'active_pro')

    expect(result.current.proStatus).toBe('active_pro')
    expect(result.current.isPro).toBe(true)
    expect(mockBillingApi.status).toHaveBeenCalledTimes(2)
  })

  it('completeTrial function calls trial.complete and refreshes', async () => {
    const billingResponse = {
      success: true,
      pro_status: 'none' as const,
      trial: {
        trialDays: 14,
        trialStartAt: '2024-01-01T00:00:00.000Z',
        daysLeft: 5,
        isTrialActive: true,
        hasCompletedTrial: false,
      },
    }

    const trialCompleteResponse = {
      success: true,
      trialDays: 14,
      trialStartAt: '2024-01-01T00:00:00.000Z',
      daysLeft: 5,
      isTrialActive: false,
      hasCompletedTrial: true,
    }

    mockBillingApi.status.mockResolvedValue(billingResponse)
    mockTrialApi.complete.mockResolvedValue(trialCompleteResponse)

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    mockBillingApi.status.mockClear()

    await result.current.completeTrial()

    await waitFor(() => !result.current.isLoading)

    expect(mockTrialApi.complete).toHaveBeenCalledTimes(1)
    expect(mockBillingApi.status).toHaveBeenCalledTimes(1)
  })

  it('completeTrial handles errors gracefully', async () => {
    const billingResponse = {
      success: true,
      pro_status: 'none' as const,
      trial: {
        trialDays: 14,
        trialStartAt: null,
        daysLeft: 0,
        isTrialActive: false,
        hasCompletedTrial: false,
      },
    }

    mockBillingApi.status.mockResolvedValue(billingResponse)
    mockTrialApi.complete.mockResolvedValue({
      success: false,
      error: 'Trial completion failed',
    })

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    // Clear the mock so refresh() won't be called after completeTrial
    mockBillingApi.status.mockClear()

    await result.current.completeTrial()

    await waitFor(
      () => !result.current.isLoading && result.current.error !== null,
    )

    expect(result.current.error).toBe('Trial completion failed')
  })

  it('handles missing trial data gracefully', async () => {
    const mockResponse = {
      success: true,
      pro_status: 'none' as const,
      trial: undefined,
    }

    mockBillingApi.status.mockResolvedValue(mockResponse)

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(result.current.proStatus).toBe('none')
    expect(result.current.trialDays).toBe(14)
    expect(result.current.daysLeft).toBe(0)
    expect(result.current.isTrialActive).toBe(false)
  })

  it('converts date strings to Date objects correctly', async () => {
    const mockResponse = {
      success: true,
      pro_status: 'active_pro' as const,
      subscriptionStartAt: '2024-01-15T10:30:00.000Z',
      trial: {
        trialDays: 14,
        trialStartAt: '2024-01-01T00:00:00.000Z',
        daysLeft: 5,
        isTrialActive: false,
        hasCompletedTrial: true,
      },
    }

    mockBillingApi.status.mockResolvedValue(mockResponse)

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(result.current.subscriptionStartAt).toBeInstanceOf(Date)
    expect(result.current.subscriptionStartAt?.toISOString()).toBe(
      '2024-01-15T10:30:00.000Z',
    )
    expect(result.current.trialStartAt).toBeInstanceOf(Date)
    expect(result.current.trialStartAt?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z',
    )
  })

  it('handles cache read errors gracefully', async () => {
    mockElectronStore.get.mockImplementation(() => {
      throw new Error('Store read error')
    })

    mockBillingApi.status.mockResolvedValue({
      success: true,
      pro_status: 'none' as const,
      trial: {
        trialDays: 14,
        trialStartAt: null,
        daysLeft: 0,
        isTrialActive: false,
        hasCompletedTrial: false,
      },
    })

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(result.current.proStatus).toBe('none')
    expect(mockBillingApi.status).toHaveBeenCalledTimes(1)
  })

  it('handles cache write errors gracefully', async () => {
    mockApi.send.mockImplementation(() => {
      throw new Error('Store write error')
    })

    const mockResponse = {
      success: true,
      pro_status: 'active_pro' as const,
      subscriptionStartAt: '2024-01-01T00:00:00.000Z',
      trial: {
        trialDays: 14,
        trialStartAt: null,
        daysLeft: 0,
        isTrialActive: false,
        hasCompletedTrial: true,
      },
    }

    mockBillingApi.status.mockResolvedValue(mockResponse)

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(result.current.proStatus).toBe('active_pro')
    expect(result.current.error).toBe(null)
  })

  it('sets up window focus listener on mount', async () => {
    mockBillingApi.status.mockResolvedValue({
      success: true,
      pro_status: 'none' as const,
      trial: {
        trialDays: 14,
        trialStartAt: null,
        daysLeft: 0,
        isTrialActive: false,
        hasCompletedTrial: false,
      },
    })

    const { result, waitFor, unmount } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(mockAddEventListener).toHaveBeenCalledWith(
      'focus',
      expect.any(Function),
    )

    unmount()

    expect(mockRemoveEventListener).toHaveBeenCalledWith(
      'focus',
      expect.any(Function),
    )
  })

  it('refreshes billing state when window gains focus', async () => {
    mockBillingApi.status.mockResolvedValue({
      success: true,
      pro_status: 'none' as const,
      trial: {
        trialDays: 14,
        trialStartAt: null,
        daysLeft: 0,
        isTrialActive: false,
        hasCompletedTrial: false,
      },
    })

    const { result, waitFor } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    mockBillingApi.status.mockClear()

    const focusHandler = mockAddEventListener.mock.calls.find(
      call => call[0] === 'focus',
    )?.[1] as () => void

    expect(focusHandler).toBeDefined()

    if (focusHandler) {
      await focusHandler()
      await waitFor(() => mockBillingApi.status.mock.calls.length > 0)
      expect(mockBillingApi.status).toHaveBeenCalledTimes(1)
    }
  })

  it('sets up periodic refresh interval', async () => {
    const originalSetInterval = global.setInterval
    const mockSetInterval = mock(() => ({}) as any)
    global.setInterval = mockSetInterval as any

    mockBillingApi.status.mockResolvedValue({
      success: true,
      pro_status: 'none' as const,
      trial: {
        trialDays: 14,
        trialStartAt: null,
        daysLeft: 0,
        isTrialActive: false,
        hasCompletedTrial: false,
      },
    })

    const { result, waitFor, unmount } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    expect(mockSetInterval).toHaveBeenCalledWith(
      expect.any(Function),
      2 * 60 * 1000,
    )

    unmount()

    global.setInterval = originalSetInterval
  })

  it('periodic refresh calls refresh function', async () => {
    const originalSetInterval = global.setInterval
    const originalClearInterval = global.clearInterval
    let intervalCallback: (() => void) | null = null
    const intervalId: any = {}
    const mockSetInterval = mock((callback: () => void, delay: number) => {
      intervalCallback = callback
      return intervalId
    })
    const mockClearInterval = mock(() => {})
    global.setInterval = mockSetInterval as any
    global.clearInterval = mockClearInterval as any

    mockBillingApi.status.mockResolvedValue({
      success: true,
      pro_status: 'none' as const,
      trial: {
        trialDays: 14,
        trialStartAt: null,
        daysLeft: 0,
        isTrialActive: false,
        hasCompletedTrial: false,
      },
    })

    const { result, waitFor, unmount } = renderHook(() => useBillingState())

    await waitFor(() => !result.current.isLoading)

    mockBillingApi.status.mockClear()

    if (intervalCallback) {
      await (intervalCallback as () => void)()
      await waitFor(() => mockBillingApi.status.mock.calls.length > 0)
      expect(mockBillingApi.status).toHaveBeenCalledTimes(1)
    }

    unmount()

    expect(mockClearInterval).toHaveBeenCalledWith(intervalId)

    global.setInterval = originalSetInterval
    global.clearInterval = originalClearInterval
  })
})
