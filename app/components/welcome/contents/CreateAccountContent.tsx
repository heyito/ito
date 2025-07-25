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
import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { checkLocalServerHealth } from '@/app/utils/healthCheck'

export default function CreateAccountContent() {
  const { incrementOnboardingStep, initializeOnboarding } = useOnboardingStore()
  const [isServerHealthy, setIsServerHealthy] = useState(true)
  const [healthCheckComplete, setHealthCheckComplete] = useState(false)

  const {
    user,
    isAuthenticated,
    loginWithGoogle,
    loginWithMicrosoft,
    loginWithApple,
    loginWithGitHub,
    loginWithSelfHosted,
  } = useAuth()

  // If user is authenticated, proceed to next step
  useEffect(() => {
    if (isAuthenticated && user) {
      incrementOnboardingStep()
    }
  }, [isAuthenticated, user, incrementOnboardingStep])

  useEffect(() => {
    initializeOnboarding()
  }, [initializeOnboarding])

  // Check server health on component mount and every 5 seconds
  useEffect(() => {
    const checkHealth = async () => {
      const { isHealthy } = await checkLocalServerHealth()
      setIsServerHealthy(isHealthy)
      setHealthCheckComplete(true)
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

        {/* Self-hosted option */}
        <div className="w-1/2 space-y-4">
          {!isServerHealthy ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full">
                  <Button
                    className="w-full h-12 text-sm font-medium"
                    onClick={handleSelfHosted}
                    disabled={!isServerHealthy}
                  >
                    Self-Hosted
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Local server must be running to use self-hosted option</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              className="w-full h-12 text-sm font-medium"
              onClick={handleSelfHosted}
              disabled={!isServerHealthy}
            >
              Self-Hosted
            </Button>
          )}
        </div>

        {/* Terms and privacy */}
        <p className="w-1/2 text-xs text-muted-foreground text-center mt-6 leading-relaxed">
          Running Ito locally requires additional setup. Please refer to our{' '}
          <a href="#" className="underline">
            Github
          </a>{' '}
          and{' '}
          <a href="#" className="underline">
            Documentation
          </a>
        </p>
      </div>
    </div>
  )
}
