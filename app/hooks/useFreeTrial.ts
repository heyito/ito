import { useCallback, useEffect, useMemo, useState } from 'react'

export type TrialStatus = {
  success: boolean
  trialDays: number
  trialStartAt: string | null
  daysLeft: number
  isTrialActive: boolean
  hasCompletedTrial: boolean
  error?: string
  status?: number
}

export function useFreeTrial() {
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<TrialStatus | null>(null)

  // Seed from cache synchronously
  useEffect(() => {
    try {
      const authStore = window.electron?.store?.get('auth') || {}
      const cached: (TrialStatus & { fetchedAt?: string }) | undefined =
        authStore?.trial
      if (cached) {
        setStatus(cached)
      }
    } catch {
      console.warn('Failed to load trial status from cache')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const cacheStatus = useCallback((s: TrialStatus) => {
    try {
      const withFetchedAt = { ...s, fetchedAt: new Date().toISOString() }
      window.api.send('electron-store-set', 'auth.trial', withFetchedAt)
    } catch {
      console.warn('Failed to cache trial status')
    }
  }, [])

  const fetchStatus = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await window.api.trial.status()
      if (!res?.success) {
        setError(res?.error || 'Failed to load trial status')
      } else {
        setStatus(res)
        cacheStatus(res)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load trial status')
    } finally {
      setIsLoading(false)
    }
  }, [cacheStatus])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const complete = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await window.api.trial.complete()
      if (!res?.success) {
        setError(res?.error || 'Failed to complete trial')
      } else {
        setStatus(res)
        cacheStatus(res)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to complete trial')
    } finally {
      setIsLoading(false)
    }
  }, [cacheStatus])

  const api = useMemo(
    () => ({
      isLoading,
      error,
      isTrialActive: !!status?.isTrialActive,
      daysLeft: status?.daysLeft ?? 0,
      trialDays: status?.trialDays ?? 14,
      trialStartAt: status?.trialStartAt ?? null,
      hasCompletedTrial: !!status?.hasCompletedTrial,
      refresh: fetchStatus,
      complete,
    }),
    [isLoading, error, status, fetchStatus, complete],
  )

  return api
}

export default useFreeTrial
