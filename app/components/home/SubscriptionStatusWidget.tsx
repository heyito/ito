import useBillingState from '@/app/hooks/useBillingState'
import { useMainStore } from '@/app/store/useMainStore'

interface SubscriptionStatusWidgetProps {
  wordsUsed?: number
}

export function SubscriptionStatusWidget({
  wordsUsed = 1000,
}: SubscriptionStatusWidgetProps) {
  const billingState = useBillingState()
  const { setCurrentPage, setSettingsPage } = useMainStore()

  const handleUpgradeClick = () => {
    setCurrentPage('settings')
    setSettingsPage('pricing-billing')
  }

  // Hide widget for active Pro subscribers (not on trial)
  if (billingState.proStatus === 'active_pro' && !billingState.isTrialActive) {
    return null
  }

  // Show trial status if user is on trial
  if (billingState.isTrialActive && billingState.daysLeft > 0) {
    return (
      <div className="fixed bottom-6 left-6 w-64 bg-white rounded-2xl border-2 border-neutral-100 shadow-lg p-6">
        <div className="space-y-4">
          {/* Header with pink dot indicator */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-pink-500 rounded-full" />
            <div className="text-base font-bold">Pro Trial Active</div>
          </div>

          {/* Days remaining */}
          <div className="text-sm">
            {billingState.daysLeft} day{billingState.daysLeft !== 1 ? 's' : ''}{' '}
            left on <span className="font-medium">Ito Pro</span>
          </div>

          {/* Upgrade button */}
          <button
            className="w-full bg-gray-900 text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 cursor-pointer transition-colors"
            onClick={handleUpgradeClick}
          >
            Upgrade Now
          </button>
        </div>
      </div>
    )
  }

  // Show free tier status (Ito Starter)
  const totalWords = 5000
  const usagePercentage = Math.min(100, (wordsUsed / totalWords) * 100)

  return (
    <div className="fixed bottom-6 left-6 w-80 bg-white rounded-2xl border-2 border-neutral-100 shadow-lg p-6">
      <div className="space-y-4">
        {/* Header */}
        <div className="text-sm text-neutral-500">Your plan</div>
        <div className="text-2xl font-bold">Ito Starter</div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-all duration-300"
            style={{ width: `${usagePercentage}%` }}
          />
        </div>

        {/* Usage text */}
        <div className="text-sm">
          You've used{' '}
          <span className="font-medium">
            {wordsUsed.toLocaleString()} of {totalWords.toLocaleString()}
          </span>{' '}
          words this week
        </div>

        {/* Upgrade button */}
        <button
          className="w-full bg-gray-900 text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 cursor-pointer transition-colors flex items-center justify-center gap-2"
          onClick={handleUpgradeClick}
        >
          <span>Get Ito</span>
          <span className="bg-white text-gray-900 px-2 py-0.5 rounded font-bold text-sm">
            PRO
          </span>
        </button>
      </div>
    </div>
  )
}
