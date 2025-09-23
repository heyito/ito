import { Button } from '@/app/components/ui/button'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/app/components/ui/tooltip'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import ItoIcon from '../../icons/ItoIcon'
import GoogleIcon from '../../icons/GoogleIcon'
import AppleIcon from '../../icons/AppleIcon'
import GitHubIcon from '../../icons/GitHubIcon'
import MicrosoftIcon from '../../icons/MicrosoftIcon'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { checkLocalServerHealth } from '@/app/utils/healthCheck'
import { useAuthStore } from '@/app/store/useAuthStore'
import { useNotesStore } from '@/app/store/useNotesStore'
import { useDictionaryStore } from '@/app/store/useDictionaryStore'
import { AppOrbitImage } from '@/app/components/ui/app-orbit-image'
import { STORE_KEYS } from '../../../../lib/constants/store-keys'
import { isValidEmail, isStrongPassword } from '@/app/utils/utils'

// Auth provider configuration
const AUTH_PROVIDERS = {
  email: {
    key: 'email',
    label: 'Email',
    icon: null,
    variant: 'default' as const,
  },
  'google-oauth2': {
    key: 'google',
    label: 'Google',
    icon: GoogleIcon,
    variant: 'outline' as const,
  },
  microsoft: {
    key: 'microsoft',
    label: 'Microsoft',
    icon: MicrosoftIcon,
    variant: 'outline' as const,
  },
  apple: {
    key: 'apple',
    label: 'Apple',
    icon: AppleIcon,
    variant: 'outline' as const,
  },
  github: {
    key: 'github',
    label: 'GitHub',
    icon: GitHubIcon,
    variant: 'outline' as const,
  },
  'self-hosted': {
    key: 'self-hosted',
    label: 'Self-Hosted',
    icon: null,
    variant: 'default' as const,
  },
}

// Reusable AuthButton component
interface AuthButtonProps {
  provider: keyof typeof AUTH_PROVIDERS
  onClick: () => void
  className?: string
  children?: React.ReactNode
  disabled?: boolean
  title?: string
}

function AuthButton({
  provider,
  onClick,
  className = '',
  children,
  disabled = false,
  title,
}: AuthButtonProps) {
  const config = AUTH_PROVIDERS[provider]
  const IconComponent = config.icon

  const button = (
    <Button
      variant={config.variant}
      className={`h-12 flex items-center justify-center gap-3 text-sm font-medium ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {IconComponent && <IconComponent className="size-5" />}
      <span>{children || config.label}</span>
    </Button>
  )

  if (disabled && title) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full">{button}</div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{title}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return button
}

export default function SignInContent() {
  const { incrementOnboardingStep } = useOnboardingStore()
  const { clearAuth } = useAuthStore()
  const { loadNotes } = useNotesStore()
  const { loadEntries } = useDictionaryStore()
  const { resetOnboarding } = useOnboardingStore()
  const [isServerHealthy, setIsServerHealthy] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const {
    user,
    isAuthenticated,
    loginWithGoogle,
    loginWithMicrosoft,
    loginWithApple,
    loginWithGitHub,
    loginWithSelfHosted,
    loginWithEmail,
    loginWithEmailPassword,
  } = useAuth()

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

  // If user is authenticated, proceed to next step
  useEffect(() => {
    if (isAuthenticated && user) {
      incrementOnboardingStep()
    }
  }, [isAuthenticated, user, incrementOnboardingStep])

  const handleSelfHosted = async () => {
    try {
      await loginWithSelfHosted()
    } catch (error) {
      console.error('Self-hosted authentication failed:', error)
    }
  }

  const handleSocialAuth = async (provider: string) => {
    try {
      switch (provider) {
        case 'google':
          await loginWithGoogle(userEmail)
          break
        case 'microsoft':
          await loginWithMicrosoft(userEmail)
          break
        case 'apple':
          await loginWithApple(userEmail)
          break
        case 'github':
          await loginWithGitHub(userEmail)
          break
        default:
          console.error('Unknown auth provider:', provider)
      }
    } catch (error) {
      console.error(`${provider} authentication failed:`, error)
    }
  }

  // Get stored user info for display
  const storedUser = window.electron?.store?.get(STORE_KEYS.AUTH)?.user
  const userEmail = storedUser?.email
  const userProvider = storedUser?.provider as keyof typeof AUTH_PROVIDERS

  // Prefill email if available
  useEffect(() => {
    if (typeof userEmail === 'string' && userEmail.length > 0) {
      setEmail(userEmail)
    }
  }, [userEmail])

  const emailOk = useMemo(() => isValidEmail(email || ''), [email])
  const isValid = useMemo(
    () => isStrongPassword(password) && emailOk,
    [password, emailOk],
  )

  const handleEmailPasswordLogin = async () => {
    if (!isValid) return
    try {
      setIsLoggingIn(true)
      setErrorMessage(null)
      await loginWithEmailPassword(email, password, { skipNavigate: true })
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : 'Login failed.'
      setErrorMessage(msg)
    } finally {
      setIsLoggingIn(false)
    }
  }

  // Helper function to format provider names for display
  const formatProviderName = (provider?: string): string => {
    if (!provider) return 'Unknown'
    return (
      AUTH_PROVIDERS[provider as keyof typeof AUTH_PROVIDERS]?.label ||
      provider.charAt(0).toUpperCase() + provider.slice(1)
    )
  }

  // Render all auth options
  const renderAllAuthOptions = () => (
    <>
      <div className="space-y-3 mb-8">
        <div className="grid grid-cols-2 gap-3">
          <AuthButton
            provider="google-oauth2"
            onClick={() => handleSocialAuth('google')}
          />
          <AuthButton
            provider="microsoft"
            onClick={() => handleSocialAuth('microsoft')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <AuthButton
            provider="apple"
            onClick={() => handleSocialAuth('apple')}
          />
          <AuthButton
            provider="github"
            onClick={() => handleSocialAuth('github')}
          />
        </div>
      </div>

      {/* Email sign in */}
      <div className="space-y-3 mb-8">
        <input
          type="email"
          placeholder="Enter your email"
          className="w-full h-12 px-3 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground"
          onChange={e => setEmail(e.target.value)}
          defaultValue={userEmail}
        />
        <AuthButton
          provider="google-oauth2"
          onClick={() => {}}
          className="hidden"
        />
        <Button
          className="w-full h-12 text-sm font-medium"
          onClick={() => loginWithEmail(email || userEmail)}
        >
          Continue with Email
        </Button>
      </div>

      {/* Divider */}
      <div className="flex items-center my-8">
        <div className="flex-1 border-t border-border"></div>
        <span className="px-4 text-xs text-muted-foreground">OR</span>
        <div className="flex-1 border-t border-border"></div>
      </div>

      {/* Self-hosted option */}
      <div className="space-y-4">
        <AuthButton
          provider="self-hosted"
          onClick={handleSelfHosted}
          className="w-full"
          disabled={!isServerHealthy}
          title={
            !isServerHealthy
              ? 'Local server must be running to use self-hosted option'
              : undefined
          }
        />
      </div>
    </>
  )

  // Render single provider option
  const renderSingleProviderOption = (
    provider: keyof typeof AUTH_PROVIDERS,
  ) => {
    // Special-case: email provider renders inline email/password form
    if (provider === 'email') {
      return (
        <div className="space-y-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground">Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleEmailPasswordLogin()
                }
              }}
              onChange={e => setPassword(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <Button
            className="h-10 w-full"
            disabled={!isValid || isLoggingIn}
            aria-busy={isLoggingIn}
            onClick={handleEmailPasswordLogin}
          >
            {isLoggingIn && (
              <span className="mr-2 inline-block size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            )}
            {isLoggingIn ? 'Logging in…' : 'Log In'}
          </Button>

          {errorMessage && (
            <p className="mt-2 text-sm text-destructive">{errorMessage}</p>
          )}
        </div>
      )
    }

    const getClickHandler = () => {
      switch (provider) {
        case 'google-oauth2':
          return () => handleSocialAuth('google')
        case 'microsoft':
          return () => handleSocialAuth('microsoft')
        case 'apple':
          return () => handleSocialAuth('apple')
        case 'github':
          return () => handleSocialAuth('github')
        case 'self-hosted':
          return handleSelfHosted
        default:
          return () => console.error('Unknown provider:', provider)
      }
    }

    const getLabel = () => {
      const config = AUTH_PROVIDERS[provider]
      return `Continue with ${config.label}`
    }

    return (
      <div className="space-y-4">
        <AuthButton
          provider={provider}
          onClick={getClickHandler()}
          className="w-full"
          disabled={provider === 'self-hosted' && !isServerHealthy}
          title={
            provider === 'self-hosted' && !isServerHealthy
              ? 'Local server must be running to use self-hosted option'
              : undefined
          }
        >
          {getLabel()}
        </AuthButton>
      </div>
    )
  }

  // Helper function to render the appropriate auth button based on stored provider
  const renderAuthButton = () => {
    // If provider is email, render the inline email/password form
    if (userProvider === 'email') {
      return renderSingleProviderOption('email')
    }
    if (!userProvider || !AUTH_PROVIDERS[userProvider]) {
      return renderAllAuthOptions()
    }
    return renderSingleProviderOption(userProvider)
  }

  return (
    <div className="flex h-full w-full bg-background">
      {/* Left side - Sign in form */}
      <div className="flex w-[30%] flex-col items-center justify-center px-12 py-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 bg-black rounded-md p-2 w-10 h-10 mx-auto">
            <ItoIcon height={24} width={24} style={{ color: '#FFFFFF' }} />
          </div>

          {/* Title and subtitle */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-semibold mb-4 text-foreground">
              Welcome back!
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              {userEmail && userProvider
                ? `You last logged in with ${formatProviderName(userProvider)} (${userEmail})`
                : userEmail
                  ? `You last logged in with ${userEmail}`
                  : 'Sign in to continue with your smart dictation.'}
            </p>
          </div>

          {/* Auth buttons - conditionally rendered based on previous provider */}
          {renderAuthButton()}

          {/* Terms and privacy - only show for self-hosted */}
          {(userProvider === 'self-hosted' || !userProvider) && (
            <p className="text-xs text-muted-foreground text-center mt-8 leading-relaxed">
              Running Ito locally requires additional setup. Please refer to our{' '}
              <a href="#" className="underline">
                Github
              </a>{' '}
              and{' '}
              <a href="#" className="underline">
                Documentation
              </a>
            </p>
          )}

          {/* Link to create new account */}
          <div className="text-center mt-8">
            <p className="text-sm text-muted-foreground">
              {userProvider
                ? 'Sign in with a different account?'
                : 'Need to create an account?'}{' '}
              <button
                onClick={() => {
                  // Clear auth to allow selecting a different account, but do not reset onboarding
                  clearAuth(false)
                  loadNotes()
                  loadEntries()
                  window.location.reload()
                }}
                className="text-foreground underline font-medium"
              >
                {userProvider ? 'Switch account' : 'Create account'}
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Placeholder for image */}
      <div className="flex w-[70%] bg-muted/20 items-center justify-center border-l border-border">
        <AppOrbitImage />
      </div>
    </div>
  )
}
