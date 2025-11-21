import {
  Home,
  BookOpen,
  FileText,
  CogFour,
  InfoCircle,
} from '@mynaui/icons-react'
import { ItoIcon } from '../icons/ItoIcon'
import { useMainStore } from '@/app/store/useMainStore'
import { useUserMetadataStore } from '@/app/store/useUserMetadataStore'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { useAuth } from '@/app/components/auth/useAuth'
import useBillingState from '@/app/hooks/useBillingState'
import { PaidStatus } from '@/lib/main/sqlite/models'
import { useEffect, useState, useRef } from 'react'
import { NavItem } from '../ui/nav-item'
import HomeContent from './contents/HomeContent'
import DictionaryContent from './contents/DictionaryContent'
import NotesContent from './contents/NotesContent'
import SettingsContent from './contents/SettingsContent'
import AboutContent from './contents/AboutContent'
import { SubscriptionStatusWidget } from './SubscriptionStatusWidget'

export default function HomeKit() {
  const { navExpanded, currentPage, setCurrentPage } = useMainStore()
  const { metadata } = useUserMetadataStore()
  const { onboardingCompleted } = useOnboardingStore()
  const { isAuthenticated, user } = useAuth()
  const billingState = useBillingState()
  const [showText, setShowText] = useState(navExpanded)
  const hasStartedTrialRef = useRef(false)
  const previousUserIdRef = useRef<string | undefined>(undefined)
  const [isStartingTrial, setIsStartingTrial] = useState(false)

  const isPro =
    metadata?.paid_status === PaidStatus.PRO ||
    metadata?.paid_status === PaidStatus.PRO_TRIAL ||
    billingState.proStatus === 'active_pro' ||
    billingState.proStatus === 'free_trial'

  // Reset flags when user changes
  useEffect(() => {
    const currentUserId = user?.id
    const previousUserId = previousUserIdRef.current

    if (currentUserId && currentUserId !== previousUserId) {
      // User changed - reset trial start flag
      hasStartedTrialRef.current = false
      setIsStartingTrial(false)
      previousUserIdRef.current = currentUserId
    } else if (currentUserId && previousUserId === undefined) {
      // First time setting userId
      previousUserIdRef.current = currentUserId
    }
  }, [user?.id])

  // Start trial for users who don't have one yet
  // Case 1: New users after onboarding completes
  // Case 2: Existing users who completed onboarding but haven't started trial yet
  useEffect(() => {
    // Skip if still loading billing state or not authenticated
    if (billingState.isLoading || !isAuthenticated) return

    // Only proceed if onboarding is completed
    if (!onboardingCompleted) return

    // Check if user has a trial or subscription
    const hasTrialOrSubscription =
      billingState.proStatus === 'free_trial' ||
      billingState.proStatus === 'active_pro' ||
      isPro

    // Start trial if:
    // 1. User hasn't started trial yet (tracked by ref)
    // 2. User doesn't have a trial or subscription
    // 3. User has completed onboarding
    if (!hasStartedTrialRef.current && !hasTrialOrSubscription) {
      hasStartedTrialRef.current = true
      setIsStartingTrial(true) // Set flag to indicate trial is being started
      // Start trial
      window.api.trial.startAfterOnboarding().catch(err => {
        console.error('Failed to start trial:', err)
        // Reset flag so we can retry if needed
        hasStartedTrialRef.current = false
        setIsStartingTrial(false)
      })
    }
  }, [
    onboardingCompleted,
    isAuthenticated,
    billingState.isLoading,
    billingState.proStatus,
    isPro,
  ])

  // Listen for trial-started event to refresh billing state
  useEffect(() => {
    const offTrialStarted = window.api.on('trial-started', async () => {
      // Trial started successfully - refresh billing state
      // HomeContent will handle showing the dialog based on billing state transition
      await billingState.refresh()
      setIsStartingTrial(false) // Reset flag after trial starts
    })

    return () => {
      offTrialStarted?.()
    }
  }, [billingState])

  // Reset trial start flag when onboarding resets
  useEffect(() => {
    if (!onboardingCompleted) {
      hasStartedTrialRef.current = false
      setIsStartingTrial(false)
    }
  }, [onboardingCompleted])

  // Listen for billing deep-link events and finalize subscription
  useEffect(() => {
    const offSuccess = window.api.on(
      'billing-session-completed',
      async (sessionId: string) => {
        try {
          if (sessionId) {
            await window.api.billing.confirmSession(sessionId)
          }
          // Ensure trial is completed locally and on server
          await window.api.trial.complete()
        } catch (err) {
          console.error('Failed to finalize billing session', err)
        }
      },
    )

    const offCancel = window.api.on('billing-session-cancelled', () => {
      // No-op for now; could show a toast in the future
    })

    return () => {
      offSuccess?.()
      offCancel?.()
    }
  }, [])

  // Handle text and positioning animation timing
  useEffect(() => {
    if (navExpanded) {
      // When expanding: slide right first, then show text
      const timer = setTimeout(() => {
        setShowText(true) // Show text after slide starts
      }, 75)
      return () => clearTimeout(timer)
    } else {
      // When collapsing: hide text immediately, then center icons after slide completes
      setShowText(false)
      // Return no-op function
      return () => {}
    }
  }, [navExpanded])

  // Render the appropriate content based on current page
  const renderContent = () => {
    switch (currentPage) {
      case 'home':
        return <HomeContent isStartingTrial={isStartingTrial} />
      case 'dictionary':
        return <DictionaryContent />
      case 'notes':
        return <NotesContent />
      case 'settings':
        return <SettingsContent />
      case 'about':
        return <AboutContent />
      default:
        return <HomeContent />
    }
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div
        className={`${navExpanded ? 'w-48' : 'w-20'} flex flex-col justify-between py-4 px-4 transition-all duration-100 ease-in-out border-r border-neutral-200`}
      >
        <div>
          {/* Logo and Plan */}
          <div className="flex items-center mb-10 px-3">
            <ItoIcon
              className="w-6 text-gray-900 flex-shrink-0"
              style={{ height: '32px' }}
            />
            <span
              className={`text-2xl font-bold transition-opacity duration-100 ${showText ? 'opacity-100' : 'opacity-0'} ${showText ? 'ml-2' : 'w-0 overflow-hidden'}`}
            >
              ito
            </span>
            {isPro && showText && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 text-white transition-opacity duration-100 ${showText ? 'opacity-100' : 'opacity-0'} ${showText ? 'ml-2' : 'w-0 overflow-hidden'}`}
              >
                PRO
              </span>
            )}
          </div>
          {/* Nav */}
          <div className="flex flex-col gap-1 text-sm">
            <NavItem
              icon={<Home className="w-5 h-5" />}
              label="Home"
              isActive={currentPage === 'home'}
              showText={showText}
              onClick={() => setCurrentPage('home')}
            />
            <NavItem
              icon={<BookOpen className="w-5 h-5" />}
              label="Dictionary"
              isActive={currentPage === 'dictionary'}
              showText={showText}
              onClick={() => setCurrentPage('dictionary')}
            />
            <NavItem
              icon={<FileText className="w-5 h-5" />}
              label="Notes"
              isActive={currentPage === 'notes'}
              showText={showText}
              onClick={() => setCurrentPage('notes')}
            />
            <NavItem
              icon={<CogFour className="w-5 h-5" />}
              label="Settings"
              isActive={currentPage === 'settings'}
              showText={showText}
              onClick={() => setCurrentPage('settings')}
            />
            <NavItem
              icon={<InfoCircle className="w-5 h-5" />}
              label="About"
              isActive={currentPage === 'about'}
              showText={showText}
              onClick={() => setCurrentPage('about')}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 items-center bg-white rounded-lg m-2 ml-0 mt-0 pt-12">
        {renderContent()}
      </div>

      {/* Subscription Status Widget */}
      <SubscriptionStatusWidget />
    </div>
  )
}
