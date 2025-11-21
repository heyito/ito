import { useCallback, useEffect, useState } from 'react'
import useBillingState, { ProStatus } from '@/app/hooks/useBillingState'
import { ProUpgradeDialog } from '../ProUpgradeDialog'
import { ProTrialExpiredModal } from '../../ui/pro-trial-expired-modal'

/**
 * Self-contained component that manages billing-related modals.
 *
 * Handles:
 * - ProUpgradeDialog (shown when trial starts)
 * - ProTrialExpiredModal (shown when trial expires)
 * - Persistence of "has shown" flags in electron-store
 * - Event listeners for billing state changes
 */
export function BillingModals() {
  const billingState = useBillingState()

  const [showProDialog, setShowProDialog] = useState(false)
  const [showTrialExpiredModal, setShowTrialExpiredModal] = useState(false)

  // Persist "has shown trial expired modal" flag in electron-store to survive remounts
  const [hasShownTrialExpiredModal, setHasShownTrialExpiredModalState] =
    useState(() => {
      try {
        const authStore = window.electron?.store?.get('auth') || {}
        return authStore?.hasShownTrialExpiredModal === true
      } catch {
        return false
      }
    })

  const setHasShownTrialExpiredModal = useCallback((value: boolean) => {
    try {
      setHasShownTrialExpiredModalState(value)
      window.api.send(
        'electron-store-set',
        'auth.hasShownTrialExpiredModal',
        value,
      )
    } catch {
      console.warn('Failed to persist hasShownTrialExpiredModal flag')
    }
  }, [])

  // Persist "has shown trial dialog" flag in electron-store to survive remounts
  const [hasShownTrialDialog, setHasShownTrialDialogState] = useState(() => {
    try {
      const authStore = window.electron?.store?.get('auth') || {}
      return authStore?.hasShownTrialDialog === true
    } catch {
      return false
    }
  })

  const setHasShownTrialDialog = useCallback((value: boolean) => {
    try {
      setHasShownTrialDialogState(value)
      window.api.send('electron-store-set', 'auth.hasShownTrialDialog', value)
    } catch {
      console.warn('Failed to persist hasShownTrialDialog flag')
    }
  }, [])

  // Show trial expired modal when trial has ended
  useEffect(() => {
    if (
      billingState.hasCompletedTrial &&
      billingState.proStatus !== ProStatus.ACTIVE_PRO &&
      !hasShownTrialExpiredModal &&
      !billingState.isLoading
    ) {
      setShowTrialExpiredModal(true)
      setHasShownTrialExpiredModal(true)
    } else if (
      billingState.proStatus === ProStatus.ACTIVE_PRO ||
      !billingState.hasCompletedTrial
    ) {
      setShowTrialExpiredModal(false)
    }
  }, [
    billingState.hasCompletedTrial,
    billingState.proStatus,
    billingState.isLoading,
    hasShownTrialExpiredModal,
    setHasShownTrialExpiredModal,
  ])

  // Show trial dialog when trial starts
  useEffect(() => {
    if (
      billingState.isTrialActive &&
      billingState.proStatus === ProStatus.FREE_TRIAL &&
      !hasShownTrialDialog &&
      !billingState.isLoading
    ) {
      setShowProDialog(true)
      setHasShownTrialDialog(true)
    }
  }, [
    billingState.isTrialActive,
    billingState.proStatus,
    billingState.isLoading,
    hasShownTrialDialog,
    setHasShownTrialDialog,
  ])

  // Listen for trial start event to refresh billing state
  useEffect(() => {
    const offTrialStarted = window.api.on('trial-started', async () => {
      await billingState.refresh()
    })

    const offBillingSuccess = window.api.on(
      'billing-session-completed',
      async () => {
        await billingState.refresh()
      },
    )

    return () => {
      offTrialStarted?.()
      offBillingSuccess?.()
    }
  }, [billingState])

  // Reset dialog flag when trial is no longer active or user becomes pro
  useEffect(() => {
    if (billingState.isLoading) {
      return
    }

    const shouldReset =
      billingState.proStatus === ProStatus.ACTIVE_PRO ||
      (billingState.proStatus === ProStatus.NONE && !billingState.isTrialActive)

    if (shouldReset && hasShownTrialDialog) {
      setHasShownTrialDialog(false)
    }
  }, [
    billingState.proStatus,
    billingState.isTrialActive,
    billingState.isLoading,
    hasShownTrialDialog,
    setHasShownTrialDialog,
  ])

  // Reset trial expired modal flag when user becomes pro or starts new trial
  useEffect(() => {
    if (billingState.isLoading) {
      return
    }

    const shouldReset =
      billingState.proStatus === ProStatus.ACTIVE_PRO ||
      billingState.isTrialActive

    if (shouldReset && hasShownTrialExpiredModal) {
      setHasShownTrialExpiredModal(false)
    }
  }, [
    billingState.proStatus,
    billingState.isTrialActive,
    billingState.isLoading,
    hasShownTrialExpiredModal,
    setHasShownTrialExpiredModal,
  ])

  return (
    <>
      <ProUpgradeDialog open={showProDialog} onOpenChange={setShowProDialog} />
      <ProTrialExpiredModal
        open={showTrialExpiredModal}
        onOpenChange={setShowTrialExpiredModal}
      />
    </>
  )
}
