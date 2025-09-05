import { Button } from '@/app/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import EmailSignupContent from './EmailSignupContent'
import EmailLoginContent from './EmailLoginContent'
import CheckEmailContent from './CheckEmailContent'
import ItoIcon from '../../icons/ItoIcon'
import UserCog from '@/app/assets/icons/UserCog.svg'
import GoogleIcon from '../../icons/GoogleIcon'
import AppleIcon from '../../icons/AppleIcon'
import GitHubIcon from '../../icons/GitHubIcon'
import MicrosoftIcon from '../../icons/MicrosoftIcon'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { checkLocalServerHealth } from '@/app/utils/healthCheck'
import { useDictionaryStore } from '@/app/store/useDictionaryStore'
import { EXTERNAL_LINKS } from '@/lib/constants/external-links'
import { isValidEmail } from '@/app/utils/utils'

export default function CreateAccountContent() {
  const { incrementOnboardingStep, initializeOnboarding } = useOnboardingStore()
  const [isServerHealthy, setIsServerHealthy] = useState(true)
  const [isSelfHostedModalOpen, setIsSelfHostedModalOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const isDictInitialized = useRef(false)
  const [showEmailPassword, setShowEmailPassword] = useState(false)
  const [showEmailLogin, setShowEmailLogin] = useState(false)
  const [showCheckEmail, setShowCheckEmail] = useState(false)
  const [checkEmailDbUserId, setCheckEmailDbUserId] = useState<string | null>(
    null,
  )
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)

  const {
    user,
    isAuthenticated,
    loginWithGoogle,
    loginWithMicrosoft,
    loginWithApple,
    loginWithGitHub,
    loginWithSelfHosted,
    signupWithEmail,
  } = useAuth()
  const userName = user?.name

  const addEntry = useDictionaryStore(state => state.addEntry)

  // If user is authenticated, proceed to next step
  useEffect(() => {
    if (isAuthenticated && user) {
      incrementOnboardingStep()
    }
  }, [isAuthenticated, user, incrementOnboardingStep])

  useEffect(() => {
    if (userName && !isDictInitialized.current) {
      console.log('Adding user name to dictionary:', userName)
      addEntry(userName)
      isDictInitialized.current = true
    }
  }, [userName, isDictInitialized, addEntry])

  useEffect(() => {
    initializeOnboarding()
  }, [initializeOnboarding])

  // Check server health on component mount and every 5 seconds
  useEffect(() => {
    const checkHealth = async () => {
      const { isHealthy } = await checkLocalServerHealth()
      setIsServerHealthy(isHealthy)
    }

    // Initial check
    checkHealth()

    // Set up periodic checks every 5 seconds
    const intervalId = setInterval(checkHealth, 5000)

    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId)
    }
  }, [])

  const handleSelfHosted = async () => {
    try {
      await loginWithSelfHosted()
    } catch (error) {
      console.error('Self-hosted authentication failed:', error)
    }
  }

  const onClickSelfHosted = async () => {
    if (!isServerHealthy) {
      setIsSelfHostedModalOpen(true)
      return
    }
    await handleSelfHosted()
  }

  const handleSocialAuth = async (provider: string) => {
    try {
      switch (provider) {
        case 'google':
          await loginWithGoogle()
          break
        case 'microsoft':
          await loginWithMicrosoft()
          break
        case 'apple':
          await loginWithApple()
          break
        case 'github':
          await loginWithGitHub()
          break
        default:
          console.error('Unknown auth provider:', provider)
      }
    } catch (error) {
      console.error(`${provider} authentication failed:`, error)
    }
  }

  const handleContinueWithEmail = async () => {
    if (!emailOk) {
      setEmailTouched(true)
      return
    }
    try {
      setIsCheckingEmail(true)
      setCheckError(null)
      const res = await window.api.invoke('auth0-check-email', { email })
      if (!res?.success) {
        setCheckError(res?.error || 'Unable to check email')
        return
      }
      if (res.exists) {
        if (res.verified) {
          setShowEmailLogin(true)
        } else {
          setCheckEmailDbUserId(res.dbUserId || null)
          setShowCheckEmail(true)
        }
      } else {
        setShowEmailPassword(true)
      }
    } finally {
      setIsCheckingEmail(false)
    }
  }

  if (showEmailPassword) {
    return (
      <EmailSignupContent
        initialEmail={email}
        onBack={() => setShowEmailPassword(false)}
        onContinue={em => signupWithEmail(em)}
      />
    )
  }

  if (showEmailLogin) {
    return (
      <EmailLoginContent
        initialEmail={email}
        onBack={() => setShowEmailLogin(false)}
        onContinue={() => {}}
      />
    )
  }

  if (showCheckEmail) {
    return (
      <CheckEmailContent
        email={email}
        dbUserId={checkEmailDbUserId}
        onUseAnotherEmail={() => setShowCheckEmail(false)}
        onRequireLogin={() => {
          setShowCheckEmail(false)
          setShowEmailLogin(true)
        }}
        password={null}
      />
    )
  }

  const emailOk = isValidEmail(email)

  return (
    <div className="flex flex-col h-full w-full bg-background items-center justify-center">
      <div className="relative flex flex-col items-center w-full h-full max-h-full px-8 py-16 mt-12 mb-12">
        {/* Logo */}
        <div className="mb-4 bg-black rounded-md p-2 w-10 h-10">
          <ItoIcon height={24} width={24} style={{ color: '#FFFFFF' }} />
        </div>

        {/* Title and subtitle */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold mb-3 text-foreground">
            Get started with Ito
          </h1>
          <p className="text-muted-foreground text-base">
            Smart dictation. Everywhere you want.
          </p>
        </div>

        {/* Social auth buttons */}
        <div className="w-1/2 space-y-3 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="w-full h-12 flex items-center justify-start gap-3 text-sm font-medium"
              onClick={() => handleSocialAuth('google')}
            >
              <GoogleIcon className="size-5" />
              <div className="w-full text-sm font-medium">
                Continue with Google
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full h-12 flex items-center justify-start gap-3 text-sm font-medium"
              onClick={() => handleSocialAuth('microsoft')}
            >
              <MicrosoftIcon className="size-5" />
              <div className="w-full text-sm font-medium">
                Continue with Microsoft
              </div>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-12 flex items-center justify-start gap-2 text-sm font-medium"
              onClick={() => handleSocialAuth('apple')}
            >
              <AppleIcon className="size-5" />
              <div className="w-full text-sm font-medium">
                Continue with Apple
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-12 flex items-center justify-start gap-2 text-sm font-medium"
              onClick={() => handleSocialAuth('github')}
            >
              <GitHubIcon className="size-5" />
              <div className="w-full text-sm font-medium">
                Continue with GitHub
              </div>
            </Button>
          </div>
        </div>

        {/* Divider */}
        <div className="w-1/2 flex items-center my-6">
          <div className="flex-1 border-t border-border"></div>
          <span className="px-4 text-xs text-muted-foreground">OR</span>
          <div className="flex-1 border-t border-border"></div>
        </div>

        {/* Email sign up */}
        <div className="w-1/2 space-y-3 mb-6">
          <input
            type="email"
            placeholder="Email address"
            onChange={e => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={emailTouched && !emailOk}
            aria-describedby={
              emailTouched && !emailOk ? 'signup-email-error' : undefined
            }
            className={`w-full h-12 px-3 rounded-md border bg-background text-foreground placeholder:text-muted-foreground ${
              emailTouched && !emailOk ? 'border-destructive' : 'border-border'
            }`}
          />
          {emailTouched && !emailOk && (
            <p id="signup-email-error" className="text-xs text-destructive">
              Please enter a valid email address
            </p>
          )}
          <Button
            className="w-full h-12 text-sm font-medium"
            disabled={!emailOk || isCheckingEmail}
            aria-busy={isCheckingEmail}
            onClick={handleContinueWithEmail}
          >
            {isCheckingEmail ? 'Checking…' : 'Continue with email'}
          </Button>
          {checkError && (
            <p className="text-xs text-destructive">{checkError}</p>
          )}
        </div>

        {/* Self-hosted option (icon + label in a row, pinned near bottom) */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center justify-center">
          <button
            type="button"
            onClick={onClickSelfHosted}
            className="flex flex-row items-center gap-2 hover:text-muted-foreground"
          >
            <img src={UserCog} alt="User settings" className="h-4 w-4" />
            <span className="text-sm">Self-Hosted</span>
          </button>
        </div>

        {/* Self-hosted modal */}
        <Dialog
          open={isSelfHostedModalOpen}
          onOpenChange={setIsSelfHostedModalOpen}
        >
          <DialogContent
            showCloseButton={false}
            className="w-[90vw] max-w-[600px] rounded-md border-0 bg-white p-6"
          >
            <DialogHeader className="mb-2 text-left">
              <DialogTitle className="text-[18px] leading-6 font-semibold text-black">
                Self-Hosted
              </DialogTitle>
              <DialogDescription className="text-sm leading-5 text-black">
                Local server must be running to use self-hosted option
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md bg-[#F5F5F5] p-4">
              <p className="text-sm font-medium leading-5 text-black">
                Running Ito locally requires additional setup. Please refer to
                our Github and Documentation
              </p>
              <div className="mt-4 flex w-full gap-4">
                <Button
                  variant="outline"
                  asChild
                  className="h-10 flex-1 basis-1/2 justify-center rounded border border-black text-sm font-medium text-black"
                >
                  <a
                    href={EXTERNAL_LINKS.GITHUB}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Github
                  </a>
                </Button>
                <Button
                  variant="outline"
                  asChild
                  className="h-10 flex-1 basis-1/2 justify-center rounded border border-black text-base font-medium text-black"
                >
                  <a
                    href={EXTERNAL_LINKS.WEBSITE}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Documentation
                  </a>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
