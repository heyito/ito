import { Button } from '@/app/components/ui/button'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import ItoIcon from '../../icons/ItoIcon'
import GoogleIcon from '../../icons/GoogleIcon'
import AppleIcon from '../../icons/AppleIcon'
import GitHubIcon from '../../icons/GitHubIcon'
import MicrosoftIcon from '../../icons/MicrosoftIcon'
import { useEffect } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useAuthStore } from '@/app/store/useAuthStore'

export default function SignInContent() {
  const { incrementOnboardingStep } = useOnboardingStore()
  const { clearAuth } = useAuthStore()
  
  const {
    user,
    isAuthenticated,
    loginWithGoogle,
    loginWithMicrosoft,
    loginWithApple,
    loginWithGitHub,
    loginWithSelfHosted
  } = useAuth()

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

  // Get stored user info for display
  const storedUser = window.electron?.store?.get('auth')?.user
  const userEmail = storedUser?.email
  const userProvider = storedUser?.provider

  // Helper function to format provider names for display
  const formatProviderName = (provider?: string): string => {
    if (!provider) return 'Unknown'
    
    switch (provider) {
      case 'google-oauth2':
        return 'Google'
      case 'github':
        return 'GitHub'
      case 'microsoft':
        return 'Microsoft'
      case 'apple':
        return 'Apple'
      case 'self-hosted':
        return 'Self-Hosted'
      default:
        return provider.charAt(0).toUpperCase() + provider.slice(1)
    }
  }

  return (
    <div className="flex h-full w-full bg-background">
      {/* Left side - Sign in form */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-6 bg-black rounded-md p-2 w-10 h-10 mx-auto">
            <ItoIcon height={24} width={24} style={{ color: '#FFFFFF' }} />
          </div>

          {/* Title and subtitle */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold mb-3 text-foreground">
              Welcome back!
            </h1>
            <p className="text-muted-foreground text-base">
              {userEmail && userProvider 
                ? `You last logged in with ${formatProviderName(userProvider)} (${userEmail})`
                : userEmail 
                ? `You last logged in with ${userEmail}`
                : 'Sign in to continue with your smart dictation.'
              }
            </p>
          </div>

          {/* Social auth buttons */}
          <div className="space-y-3 mb-6">
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12 flex items-center justify-center gap-3 text-sm font-medium"
                onClick={() => handleSocialAuth('google')}
              >
                <GoogleIcon className="size-5" />
                <span>Google</span>
              </Button>

              <Button
                variant="outline"
                className="h-12 flex items-center justify-center gap-3 text-sm font-medium"
                onClick={() => handleSocialAuth('microsoft')}
              >
                <MicrosoftIcon className="size-5" />
                <span>Microsoft</span>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12 flex items-center justify-center gap-2 text-sm font-medium"
                onClick={() => handleSocialAuth('apple')}
              >
                <AppleIcon className="size-5" />
                <span>Apple</span>
              </Button>

              <Button
                variant="outline"
                className="h-12 flex items-center justify-center gap-2 text-sm font-medium"
                onClick={() => handleSocialAuth('github')}
              >
                <GitHubIcon className="size-5" />
                <span>GitHub</span>
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center my-6">
            <div className="flex-1 border-t border-border"></div>
            <span className="px-4 text-xs text-muted-foreground">OR</span>
            <div className="flex-1 border-t border-border"></div>
          </div>

          {/* Self-hosted option */}
          <div className="space-y-4">
            <Button
              className="w-full h-12 text-sm font-medium"
              onClick={handleSelfHosted}
            >
              Self-Hosted (Free)
            </Button>
          </div>

          {/* Terms and privacy */}
          <p className="text-xs text-muted-foreground text-center mt-6 leading-relaxed">
            Running Ito locally requires additional setup. Please refer to our{' '}
            <a href="#" className="underline">
              Github
            </a>{' '}
            and{' '}
            <a href="#" className="underline">
              Documentation
            </a>
          </p>

          {/* Link to create new account */}
          <div className="text-center mt-6">
            <p className="text-sm text-muted-foreground">
              Sign in with a different account?{' '}
              <button
                onClick={() => {
                  // Completely clear user data for new account creation
                  clearAuth(false)
                  window.location.reload()
                }}
                className="text-foreground underline font-medium"
              >
                Create account
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Placeholder for image */}
      <div className="flex-1 bg-muted/20 flex items-center justify-center border-l border-border">
        <div className="text-center text-muted-foreground">
          <div className="w-24 h-24 mx-auto mb-4 bg-muted rounded-lg flex items-center justify-center">
            <ItoIcon height={48} width={48} style={{ color: 'currentColor' }} />
          </div>
          <p className="text-sm">Image placeholder</p>
        </div>
      </div>
    </div>
  )
} 