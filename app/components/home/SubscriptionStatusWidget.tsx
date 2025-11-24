import useBillingState, {
  BillingState,
  ProStatus,
} from '@/app/hooks/useBillingState'
import { useMainStore } from '@/app/store/useMainStore'

interface SubscriptionStatusWidgetProps {
  wordsUsed?: number
  navExpanded?: boolean
}

const mockBillingState: BillingState = {
  proStatus: ProStatus.FREE_TRIAL,
  subscriptionStartAt: null,
  subscriptionEndAt: null,
  isScheduledForCancellation: false,
  trialDays: 14,
  trialStartAt: null,
  daysLeft: 1,
  isTrialActive: true,
  hasCompletedTrial: false,
}

export function SubscriptionStatusWidget({
  wordsUsed = 1000,
  navExpanded = true,
}: SubscriptionStatusWidgetProps) {
  // const billingState = useBillingState()
  const billingState = mockBillingState as BillingState // Use mock for testing
  console.log({ billingState })
  const { setCurrentPage, setSettingsPage } = useMainStore()

  const handleUpgradeClick = () => {
    setCurrentPage('settings')
    setSettingsPage('pricing-billing')
  }

  // Common styles
  const cardClassName =
    'w-full bg-white rounded-2xl border-2 border-neutral-100 shadow-sm p-2 space-y-1.5'
  const progressBarContainerClassName =
    'w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden'
  const progressBarFillClassName =
    'h-full transition-all duration-300 bg-gradient-to-r'
  const buttonBaseClassName =
    'w-full text-white px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-gray-800 cursor-pointer transition-colors mt-4'

  // Hide widget when sidebar is collapsed
  if (!navExpanded) {
    return null
  }

  // Hide widget for active Pro subscribers
  if (billingState.proStatus === ProStatus.ACTIVE_PRO) {
    return null
  }

  // Show trial status if user is on free trial
  if (billingState.proStatus === ProStatus.FREE_TRIAL) {
    const daysUsed = billingState.trialDays - billingState.daysLeft
    const trialPercentage = Math.min(
      100,
      (daysUsed / billingState.trialDays) * 100,
    )

    return (
      <div className={cardClassName}>
        {/* Header */}
        <div className="text-sm font-bold">Pro Trial Active</div>

        {/* Progress bar */}
        <div className={progressBarContainerClassName}>
          <div
            className={`${progressBarFillClassName} from-purple-500 to-pink-500`}
            style={{ width: `${trialPercentage}%` }}
          />
        </div>

        {/* Days remaining */}
        <div className="text-xs">
          {billingState.daysLeft} day{billingState.daysLeft !== 1 ? 's' : ''}{' '}
          left on <span className="font-medium">Ito Pro</span>
        </div>

        {/* Upgrade button */}
        <button
          className={`${buttonBaseClassName} bg-gray-900`}
          onClick={handleUpgradeClick}
        >
          Upgrade Now
        </button>
      </div>
    )
  }

  // Show free tier status (Ito Starter)
  const totalWords = 5000
  const usagePercentage = Math.min(100, (wordsUsed / totalWords) * 100)

  return (
    <div className={cardClassName}>
      {/* Header */}
      <div className="text-xs text-neutral-500">Your plan</div>
      <div className="text-lg font-bold">Ito Starter</div>

      {/* Progress bar */}
      <div className={progressBarContainerClassName}>
        <div
          className={`${progressBarFillClassName} from-blue-500 via-purple-500 to-pink-500`}
          style={{ width: `${usagePercentage}%` }}
        />
      </div>

      {/* Usage text */}
      <div className="text-xs">
        You've used{' '}
        <span className="font-medium">
          {wordsUsed.toLocaleString()} of {totalWords.toLocaleString()}
        </span>{' '}
        words this week
      </div>

      {/* Upgrade button */}
      <button
        className={`${buttonBaseClassName} bg-gray-900 flex items-center justify-center gap-2`}
        onClick={handleUpgradeClick}
      >
        <span>Get Ito</span>
        <span className="bg-white text-gray-900 px-2 py-0.5 rounded font-bold text-xs">
          PRO
        </span>
      </button>
    </div>
  )
}
