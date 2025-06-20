import { Button } from '@/app/components/ui/button'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import ItoIcon from '../../icons/ItoIcon'
import GoogleIcon from '../../icons/GoogleIcon'
import AppleIcon from '../../icons/AppleIcon'
import GitHubIcon from '../../icons/GitHubIcon'
import MicrosoftIcon from '../../icons/MicrosoftIcon'
import { useState, useEffect } from 'react'
import { useAuth } from '../../auth/useAuth'

export default function CreateAccountContent() {
  const { incrementOnboardingStep } = useOnboardingStore()
  const [email, setEmail] = useState('')
  
  const {
    user,
    isAuthenticated,
    loginWithGoogle,
    loginWithMicrosoft,
    loginWithApple,
    loginWithEmail,
    loginWithGitHub
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
    
    try {
      await loginWithEmail(email)
    } catch (error) {
      console.error('Email authentication failed:', error)
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

  return (
    <div className="flex flex-col h-full w-full bg-background items-center justify-center">
      <div className="flex flex-col items-center w-full h-full max-h-full px-8 py-16 mt-12 mb-12">
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
              className="w-full h-10 flex items-center justify-start gap-3 text-sm font-medium"
              onClick={() => handleSocialAuth('google')}
            >
              <GoogleIcon width={24} height={24} />
              <div className="w-full text-sm font-medium">Continue with Google</div>
            </Button>

            <Button
              variant="outline"
              className="w-full h-10 flex items-center justify-start gap-3 text-sm font-medium"
              onClick={() => handleSocialAuth('microsoft')}
            >
              <MicrosoftIcon width={24} height={24} />
              <div className="w-full text-sm font-medium">Continue with Microsoft</div>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-10 flex items-center justify-start gap-2 text-sm font-medium"
              onClick={() => handleSocialAuth('apple')}
            >
              <AppleIcon width={24} height={24} />
              <div className="w-full text-sm font-medium">Continue with Apple</div>
            </Button>

            <Button
              variant="outline"
              className="h-10 flex items-center justify-start gap-2 text-sm font-medium"
              onClick={() => handleSocialAuth('github')}
            >
              <GitHubIcon width={24} height={24} />
              <div className="w-full text-sm font-medium">Continue with GitHub</div>
            </Button>
          </div>
        </div>

        {/* Divider */}
        <div className="w-1/2 flex items-center my-6">
          <div className="flex-1 border-t border-border"></div>
          <span className="px-4 text-xs text-muted-foreground">OR</span>
          <div className="flex-1 border-t border-border"></div>
        </div>

        {/* Email input */}
        <div className="w-1/2 space-y-4">
          <input
            type="email"
            placeholder="Enter an email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleContinueWithEmail()}
            className="w-full h-10 px-4 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
          />

          <Button
            className="w-full h-10 text-sm font-medium"
            onClick={handleContinueWithEmail}
            disabled={!email.trim()}
          >
            Continue with Email
          </Button>
        </div>

        {/* Terms and privacy */}
        <p className="w-1/2 text-xs text-muted-foreground text-center mt-6 leading-relaxed">
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