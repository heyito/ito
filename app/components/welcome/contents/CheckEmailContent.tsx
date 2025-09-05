import { useEffect, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { AppOrbitImage } from '@/app/components/ui/app-orbit-image'
import { useAuth } from '../../auth/useAuth'

type Props = {
  email: string
  password: string | null
  dbUserId: string | null
  onUseAnotherEmail: () => void
  onRequireLogin?: () => void
}

export default function CheckEmailContent({
  email,
  password,
  dbUserId,
  onUseAnotherEmail,
  onRequireLogin = () => {},
}: Props) {
  const [seconds, setSeconds] = useState(30)
  const [isResending, setIsResending] = useState(false)
  const [pollError, setPollError] = useState<string | null>(null)
  const [resendError, setResendError] = useState<string | null>(null)

  const { loginWithEmailPassword } = useAuth()

  useEffect(() => {
    if (seconds <= 0) return
    const id = setInterval(() => setSeconds(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [seconds])

  const handleResend = async () => {
    if (seconds > 0 || isResending) return
    try {
      setIsResending(true)
      setResendError(null)
      let success = true
      const res = await window.api.invoke('auth0-send-verification', {
        dbUserId,
      })
      if (!res?.success) {
        success = false
        setResendError(res?.error || 'Failed to resend verification email')
      } else if (!res?.jobId) {
        setResendError(
          'Verification email requested but no job id was returned',
        )
      }
      if (success) setSeconds(30)
    } finally {
      setIsResending(false)
    }
  }

  // Poll for verification status every 4 seconds
  useEffect(() => {
    let mounted = true
    const poll = async () => {
      try {
        console.log('Polling for email verification')
        const res = await window.api.invoke('auth0-check-email', {
          email,
        })
        if (mounted && res?.success && res.verified) {
          console.log('Email verified')
          if (password) {
            await loginWithEmailPassword(email, password, {
              skipNavigate: true,
            })
          } else {
            onRequireLogin()
          }
        }
        if (mounted && !res?.success) {
          setPollError(res?.error || null)
        }
      } catch (e: any) {
        if (mounted) setPollError(e?.message || 'Polling error')
      }
    }
    const id = setInterval(poll, 4000)
    poll()
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [email, dbUserId, loginWithEmailPassword, onRequireLogin, password])

  return (
    <div className="flex h-full w-full bg-background">
      {/* Left content */}
      <div className="flex w-1/2 flex-col justify-center px-16">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We've sent a message to {email}.
          </p>
        </div>

        <ol className="mb-6 list-decimal space-y-3 pl-5 text-sm text-foreground">
          <li>
            Open the email and click{' '}
            <span className="font-medium">Confirm email</span> to activate your
            account.
          </li>
          <li>
            Once verified, return here - this page will refresh automatically.
          </li>
        </ol>

        <div className="mb-4">
          <Button
            variant="outline"
            disabled={seconds > 0 || isResending}
            onClick={handleResend}
            className="h-10 w-full justify-center"
          >
            {seconds > 0
              ? `Resend email (${seconds} Sec)`
              : isResending
                ? 'Resending…'
                : 'Resend email'}
          </Button>
          {resendError && (
            <p className="mt-2 text-xs text-destructive">{resendError}</p>
          )}
        </div>

        <button
          className="text-sm text-foreground underline"
          onClick={onUseAnotherEmail}
        >
          Use another email
        </button>

        <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">
          If you don't see it, check your Spam or Promotions folder for a
          message from support@ito.ai
        </p>
        {pollError && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {pollError}
          </p>
        )}
      </div>

      {/* Right illustration */}
      <div className="flex w-1/2 items-center justify-center border-l border-border bg-muted/20">
        <AppOrbitImage />
      </div>
    </div>
  )
}
