import { Button } from '@/app/components/ui/button'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import ItoIcon from '../../icons/ItoIcon'
import { useState, useEffect } from 'react'
import { useAuth } from '../../../../lib/auth/useAuth'

export default function CreateAccountContent() {
  const { incrementOnboardingStep } = useOnboardingStore()
  const [email, setEmail] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    loginWithGoogle,
    loginWithMicrosoft,
    loginWithApple,
    loginWithEmail,
    loginWithSSO
  } = useAuth()

  // If user is authenticated, proceed to next step
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('User authenticated:', user)
      incrementOnboardingStep()
    }
  }, [isAuthenticated, user, incrementOnboardingStep])

  const handleContinueWithEmail = async () => {
    if (!email.trim()) return
    
    setIsAuthenticating(true)
    try {
      await loginWithEmail(email)
    } catch (error) {
      console.error('Email authentication failed:', error)
      setIsAuthenticating(false)
    }
  }

  const handleSocialAuth = async (provider: string) => {
    setIsAuthenticating(true)
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
        case 'sso':
          await loginWithSSO()
          break
        default:
          console.error('Unknown auth provider:', provider)
      }
    } catch (error) {
      console.error(`${provider} authentication failed:`, error)
      setIsAuthenticating(false)
    }
  }

  // Show loading state during authentication
  if (isLoading || isAuthenticating) {
    return (
      <div className="flex flex-col h-full w-full bg-background items-center justify-center">
        <div className="flex flex-col items-center max-w-md w-full px-8">
          <div className="mb-8">
            <ItoIcon />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-semibold mb-3 text-foreground">
              Authenticating...
            </h1>
            <p className="text-muted-foreground text-base">
              Please wait while we sign you in.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Show error state if authentication failed
  if (error) {
    return (
      <div className="flex flex-col h-full w-full bg-background items-center justify-center">
        <div className="flex flex-col items-center max-w-md w-full px-8">
          <div className="mb-8">
            <ItoIcon />
          </div>
          <div className="text-center mb-6">
            <h1 className="text-3xl font-semibold mb-3 text-foreground">
              Authentication Error
            </h1>
            <p className="text-muted-foreground text-base mb-4">
              {error.message || 'Something went wrong during authentication.'}
            </p>
            <Button 
              onClick={() => window.location.reload()}
              className="w-full h-12 text-sm font-medium"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full bg-background items-center justify-center">
      <div className="flex flex-col items-center max-w-md w-full px-8">
        {/* Logo */}
        <div className="mb-8">
          <ItoIcon />
        </div>

        {/* Title and subtitle */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold mb-3 text-foreground">
            Get started with Ito
          </h1>
          <p className="text-muted-foreground text-base">
            Dictate 3x faster. Everywhere you type.
          </p>
        </div>

        {/* Social auth buttons */}
        <div className="w-full space-y-3 mb-6">
          <Button
            variant="outline"
            className="w-full h-12 flex items-center justify-center gap-3 text-sm font-medium"
            onClick={() => handleSocialAuth('google')}
            disabled={isAuthenticating}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          <Button
            variant="outline"
            className="w-full h-12 flex items-center justify-center gap-3 text-sm font-medium"
            onClick={() => handleSocialAuth('microsoft')}
            disabled={isAuthenticating}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#f25022" d="M1 1h10v10H1z" />
              <path fill="#00a4ef" d="M13 1h10v10H13z" />
              <path fill="#7fba00" d="M1 13h10v10H1z" />
              <path fill="#ffb900" d="M13 13h10v10H13z" />
            </svg>
            Continue with Microsoft
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-12 flex items-center justify-center gap-2 text-sm font-medium"
              onClick={() => handleSocialAuth('apple')}
              disabled={isAuthenticating}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              Continue with Apple
            </Button>

            <Button
              variant="outline"
              className="h-12 flex items-center justify-center gap-2 text-sm font-medium"
              onClick={() => handleSocialAuth('sso')}
              disabled={isAuthenticating}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              Single sign-on (SSO)
            </Button>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full flex items-center my-6">
          <div className="flex-1 border-t border-border"></div>
          <span className="px-4 text-sm text-muted-foreground">OR</span>
          <div className="flex-1 border-t border-border"></div>
        </div>

        {/* Email input */}
        <div className="w-full space-y-4">
          <input
            type="email"
            placeholder="Enter an email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleContinueWithEmail()}
            disabled={isAuthenticating}
            className="w-full h-12 px-4 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
          />
          
          <p className="text-xs text-muted-foreground text-center">
            Use your work or school email to enjoy the upcoming team and collaboration features.
          </p>

          <Button
            className="w-full h-12 text-sm font-medium"
            onClick={handleContinueWithEmail}
            disabled={!email.trim() || isAuthenticating}
          >
            {isAuthenticating ? 'Signing up...' : 'Continue with Email'}
          </Button>
        </div>

        {/* Terms and privacy */}
        <p className="text-xs text-muted-foreground text-center mt-6 leading-relaxed">
          By signing up, you agree to our{' '}
          <a href="#" className="underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="underline">
            Privacy Policy
          </a>
          . Your name and email will be used to personalize your Ito experience.
        </p>
      </div>
    </div>
  )
} 