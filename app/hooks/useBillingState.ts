import { useCallback, useEffect, useMemo, useState } from 'react'

export type BillingState = {
  proStatus: 'active_pro' | 'free_trial' | 'none'
  subscriptionStartAt: Date | null
  trialDays: number
  trialStartAt: Date | null
  daysLeft: number
  isTrialActive: boolean
  hasCompletedTrial: boolean
}

export function useBillingState() {
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<BillingState | null>(null)

  useEffect(() => {
    try {
      const authStore = window.electron?.store?.get('auth') || {}
      const cached: (BillingState & { fetchedAt?: string }) | undefined =
        authStore?.billing
      if (cached) {
        setState({
          ...cached,
          subscriptionStartAt: cached.subscriptionStartAt
            ? new Date(cached.subscriptionStartAt)
            : null,
          trialStartAt: cached.trialStartAt
            ? new Date(cached.trialStartAt)
            : null,
        })
      }
    } catch {
      console.warn('Failed to load billing state from cache')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const cacheState = useCallback((s: BillingState) => {
    try {
      const withFetchedAt = { ...s, fetchedAt: new Date().toISOString() }
      window.api.send('electron-store-set', 'auth.billing', withFetchedAt)
    } catch {
      console.warn('Failed to cache billing state')
    }
  }, [])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await window.api.billing.status()
      if (!res?.success) {
        setError(res?.error || 'Failed to load billing status')
      } else {
        const subStart = res?.subscriptionStartAt
          ? new Date(res.subscriptionStartAt)
          : null
        const trial = res?.trial || {}
        const next: BillingState = {
          proStatus: res.pro_status,
          subscriptionStartAt: subStart,
          trialDays: trial.trialDays ?? 14,
          trialStartAt: trial.trialStartAt
            ? new Date(trial.trialStartAt)
            : null,
          daysLeft: trial.daysLeft ?? 0,
          isTrialActive: !!trial.isTrialActive,
          hasCompletedTrial: !!trial.hasCompletedTrial,
        }
        setState(next)
        cacheState(next)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load billing status')
    } finally {
      setIsLoading(false)
    }
  }, [cacheState])

  useEffect(() => {
    refresh()
  }, [refresh])

  const completeTrial = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await window.api.trial.complete()
      if (!res?.success) {
        setError(res?.error || 'Failed to complete trial')
      } else {
        await refresh()
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to complete trial')
    } finally {
      setIsLoading(false)
    }
  }, [refresh])

  const api = useMemo(
    () => ({
      isLoading,
      error,
      proStatus: state?.proStatus ?? 'none',
      isPro: (state?.proStatus ?? 'none') === 'active_pro',
      hasSubscription: (state?.proStatus ?? 'none') === 'active_pro',
      subscriptionStartAt: state?.subscriptionStartAt ?? null,

      isTrialActive: !!state?.isTrialActive,
      daysLeft: state?.daysLeft ?? 0,
      trialDays: state?.trialDays ?? 14,
      trialStartAt: state?.trialStartAt ?? null,
      hasCompletedTrial: !!state?.hasCompletedTrial,
      refresh,
      completeTrial,
    }),
    [isLoading, error, state, refresh, completeTrial],
  )

  return api
}

export default useBillingState
