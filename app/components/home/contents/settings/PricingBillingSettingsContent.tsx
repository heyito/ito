import { useState, useEffect } from 'react'
import { Switch } from '@/app/components/ui/switch'
import { Button } from '@/app/components/ui/button'
import { Check } from '@mynaui/icons-react'
import useBillingState from '@/app/hooks/useBillingState'

type BillingPeriod = 'monthly' | 'annual'

export default function PricingBillingSettingsContent() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('annual')
  const billingState = useBillingState()
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [downgradeLoading, setDowngradeLoading] = useState(false)

  // Refresh billing state when checkout session completes
  useEffect(() => {
    const offSuccess = window.api.on('billing-session-completed', async () => {
      // Refresh billing state to reflect the new subscription
      await billingState.refresh()
      setCheckoutError(null)
    })

    return () => {
      offSuccess?.()
    }
  }, [billingState])

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

  const handleDowngrade = async () => {
    setDowngradeLoading(true)
    setCheckoutError(null)
    try {
      const res = await window.api.billing.cancelSubscription()
      if (res?.success) {
        await billingState.refresh()
      } else {
        setCheckoutError(
          res?.error || 'Failed to cancel subscription. Please try again.',
        )
      }
    } catch (err: any) {
      setCheckoutError(
        err?.message || 'Failed to cancel subscription. Please try again.',
      )
    } finally {
      setDowngradeLoading(false)
    }
  }

  const handleContactUs = () => {
    window.api.openMailto('support@ito.ai')
  }

  // Determine button states based on billing status
  const getStarterButtonText = () => {
    if (billingState.isLoading) return 'Loading...'
    if (downgradeLoading) return 'Cancelling...'
    if (billingState.proStatus === 'active_pro') return 'Downgrade plan'
    if (billingState.proStatus === 'none' && !billingState.isTrialActive) {
      return 'Current plan'
    }
    return 'Current plan'
  }

  const getStarterButtonDisabled = () => {
    return (
      (billingState.proStatus === 'none' && !billingState.isTrialActive) ||
      billingState.isLoading ||
      downgradeLoading
    )
  }

  const getProButtonText = () => {
    if (checkoutLoading) return 'Loading...'
    if (billingState.isLoading) return 'Loading...'
    if (billingState.proStatus === 'active_pro') return 'Current plan'
    return 'Upgrade'
  }

  const getProButtonDisabled = () => {
    return (
      billingState.proStatus === 'active_pro' ||
      billingState.isLoading ||
      checkoutLoading
    )
  }

  return (
    <div className="space-y-8">
      {/* TODO: Integrate later  */}
      {/* Billing Period Toggle */}
      {/* <div className="flex items-center justify-center gap-3">
        <span
          className={`text-sm font-medium ${billingPeriod === 'monthly' ? 'text-gray-900' : 'text-gray-500'}`}
        >
          Monthly
        </span>
        <Switch
          checked={billingPeriod === 'annual'}
          onCheckedChange={checked =>
            setBillingPeriod(checked ? 'annual' : 'monthly')
          }
        />
        <span
          className={`text-sm font-medium ${billingPeriod === 'annual' ? 'text-gray-900' : 'text-gray-500'}`}
        >
          Annual
        </span>
        <span className="text-sm text-green-600 font-medium">Saved 20%</span>
      </div> */}

      {/* Error Message */}
      {checkoutError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {checkoutError}
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid grid-cols-3 gap-6">
        {/* Starter Card */}
        <PricingCard
          title="Starter"
          price="FREE"
          features={[
            '4,000 words per week',
            'Lightning fast voice-typing',
            'Add words to dictionary',
            'Support for 100+ languages',
          ]}
          actionButton={
            <Button
              variant="outline"
              size="lg"
              className="w-full rounded-xl"
              disabled={getStarterButtonDisabled()}
              onClick={handleDowngrade}
            >
              {getStarterButtonText()}
            </Button>
          }
        />

        {/* Pro Card */}
        <PricingCard
          title="Pro"
          price="$8.99"
          priceSubtext="/ month"
          isHighlighted
          features={[
            'Everything in Starter, and',
            'Unlimited words per week',
            'Ultra fast dictation as fast as 0.3 second',
            'Priority customer support',
            'Early access to new functionality',
          ]}
          actionButton={
            <Button
              variant="default"
              size="lg"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-xl"
              disabled={getProButtonDisabled()}
              onClick={handleCheckout}
            >
              {getProButtonText()}
            </Button>
          }
        />

        {/* Team/Enterprise Card */}
        <PricingCard
          title="Team"
          price="Enterprise"
          features={[
            'Admin controls',
            'Shared resources',
            'Shared dictionary',
            'SOC 2 compliance',
          ]}
          actionButton={
            <Button
              variant="outline"
              size="lg"
              className="w-full rounded-xl border-gray-200"
              onClick={handleContactUs}
            >
              Contact Us
            </Button>
          }
        />
      </div>
    </div>
  )
}

interface PricingCardProps {
  title: string
  price: string
  priceSubtext?: string
  features: string[]
  actionButton: React.ReactNode
  isHighlighted?: boolean
}

function PricingCard({
  title,
  price,
  priceSubtext,
  features,
  actionButton,
  isHighlighted = false,
}: PricingCardProps) {
  return (
    <div
      className={`rounded-xl border-2 p-6 flex flex-col ${
        isHighlighted
          ? 'border-purple-500 bg-gradient-to-br from-purple-50/30 to-pink-50/30'
          : 'border-gray-200 bg-white'
      }`}
    >
      {/* Title */}
      <div className="text-sm font-medium text-gray-700 mb-2">{title}</div>

      {/* Price */}
      <div className="mb-6">
        <span
          className={`text-4xl font-bold ${
            isHighlighted
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent'
              : 'text-gray-900'
          }`}
        >
          {price}
        </span>
        {priceSubtext && (
          <span className="text-gray-600 ml-1">{priceSubtext}</span>
        )}
      </div>

      {/* Features */}
      <div className="flex-1 space-y-3 mb-6">
        {features.map((feature, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Check className="w-5 h-5" strokeWidth={3} />
            </div>
            <span className="text-sm text-gray-900">{feature}</span>
          </div>
        ))}
      </div>

      {/* Action Button */}
      <div className="mt-auto">{actionButton}</div>
    </div>
  )
}
