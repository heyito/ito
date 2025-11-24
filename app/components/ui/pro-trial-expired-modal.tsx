import React, { useState, useEffect } from 'react'
import { Check } from '@mynaui/icons-react'
import { Dialog, DialogContent, DialogFooter } from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import proBannerImage from '@/app/assets/pro-banner.png'
import useBillingState from '@/app/hooks/useBillingState'

interface ProTrialExpiredModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProTrialExpiredModal({
  open,
  onOpenChange,
}: ProTrialExpiredModalProps) {
  const billingState = useBillingState()
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // Refresh billing state when checkout session completes
  useEffect(() => {
    const offSuccess = window.api.on('billing-session-completed', async () => {
      // Refresh billing state to reflect the new subscription
      await billingState.refresh()
      setCheckoutError(null)
      // Close the dialog after successful checkout
      onOpenChange(false)
    })

    return () => {
      offSuccess?.()
    }
  }, [billingState, onOpenChange])

  const handleCheckout = async () => {
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const res = await window.api.billing.createCheckoutSession()
      if (res?.success && res?.url) {
        await window.api.invoke('web-open-url', res.url)
      } else {
        setCheckoutError(
          res?.error || 'Failed to create checkout session. Please try again.',
        )
      }
    } catch (err: any) {
      setCheckoutError(
        err?.message || 'Failed to create checkout session. Please try again.',
      )
    } finally {
      setCheckoutLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none">
        {/* Banner Header with Image */}
        <div
          className="relative px-8 py-12 text-center bg-cover bg-center"
          style={{ backgroundImage: `url(${proBannerImage})` }}
        >
          {/* PRO Badge */}
          <div className="relative inline-block mb-6">
            <div className="bg-white rounded-full px-12 py-4 shadow-lg">
              <span className="text-5xl font-black bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                PRO
              </span>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 bg-white">
          <h2 className="text-3xl font-semibold mb-2">Ito Pro has expired.</h2>

          <p className="text-lg text-gray-600 mb-6">
            Unlock full access with Ito Pro.
          </p>

          {checkoutError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-6">
              {checkoutError}
            </div>
          )}

          <div className="space-y-3 mb-6 border border-gray-200 rounded-lg p-4">
            <FeatureItem text="Unlimited words per week" />
            <FeatureItem text="Ultra fast dictation as fast as 0.3 second" />
            <FeatureItem text="Priority customer support" />
            <FeatureItem text="Early access to new functionality" />
          </div>

          {/* Buttons */}
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button
              onClick={handleCheckout}
              variant="default"
              size="lg"
              className="rounded-xl border-gray-200"
              disabled={checkoutLoading || billingState.isLoading}
            >
              {checkoutLoading ? 'Loading...' : 'Get Ito PRO'}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              size="lg"
              className="rounded-xl border-gray-200"
            >
              Stay on Free
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0">
        <Check className="w-5 h-5" strokeWidth={3} />
      </div>
      <span className="text-gray-900">{text}</span>
    </div>
  )
}
