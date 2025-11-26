import { useMemo, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { AppOrbitImage } from '../../ui/app-orbit-image'
import { STORE_KEYS } from '../../../../lib/constants/store-keys'
import { isValidEmail } from '@/app/utils/utils'

type Props = {
  email?: string
  onBack: () => void
}

export default function ResetPassword({ email, onBack }: Props) {
  const storedUser = window.electron?.store?.get(STORE_KEYS.AUTH)?.user
  const initialEmail = email || storedUser?.email || ''

  const [editableEmail, setEditableEmail] = useState(initialEmail)
  const [isEditingEmail, setIsEditingEmail] = useState(!initialEmail)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [isResending, setIsResending] = useState(false)

  const emailOk = useMemo(() => isValidEmail(editableEmail), [editableEmail])

  const handleContinue = async () => {
    if (!editableEmail || !emailOk) {
      setError('Please enter a valid email address')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const res = await window.api.invoke('auth0-reset-password', {
        email: editableEmail,
      })

      if (res?.success) {
        setEmailSent(true)
        setSeconds(30)
        // Start countdown
        const id = setInterval(() => {
          setSeconds(s => {
            if (s <= 1) {
              clearInterval(id)
              return 0
            }
            return s - 1
          })
        }, 1000)
      } else {
        setError(res?.error || 'Failed to send reset email')
      }
    } catch (e: any) {
      setError(e?.message || 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (seconds > 0 || isResending) return

    try {
      setIsResending(true)
      setError(null)

      const res = await window.api.invoke('auth0-reset-password', {
        email: editableEmail,
      })

      if (res?.success) {
        setSeconds(30)
        const id = setInterval(() => {
          setSeconds(s => {
            if (s <= 1) {
              clearInterval(id)
              return 0
            }
            return s - 1
          })
        }, 1000)
      } else {
        setError(res?.error || 'Failed to resend reset email')
      }
    } catch (e: any) {
      setError(e?.message || 'An error occurred')
    } finally {
      setIsResending(false)
    }
  }

  const handleOpenEmailApp = () => {
    window.api.invoke('web-open-url', 'mailto:')
  }

  // Check Your Inbox view (after email sent)
  if (emailSent) {
    return (
      <div className="flex h-full w-full bg-background">
        {/* Left content */}
        <div className="flex w-1/2 flex-col justify-center px-16">
          <button
            onClick={onBack}
            className="mb-6 w-fit text-sm text-muted-foreground hover:underline"
          >
            Back
          </button>

          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-foreground">
              Check Your Inbox
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We've sent a reset link to {editableEmail}.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Follow the instructions in the email to set a new password.
            </p>
          </div>

          <Button
            onClick={handleOpenEmailApp}
            className="h-10 w-full justify-center"
          >
            Open email app
          </Button>

          <button
            className="mt-4 text-sm text-foreground"
            onClick={handleResend}
            disabled={seconds > 0 || isResending}
          >
            Didn't get the email?{' '}
            <span className="underline">
              {seconds > 0
                ? `Resend (${seconds}s)`
                : isResending
                  ? 'Resending…'
                  : 'Resend'}
            </span>
          </button>

          {error && (
            <p className="mt-2 text-center text-xs text-destructive">{error}</p>
          )}
        </div>

        {/* Right illustration */}
        <div className="flex w-1/2 items-center justify-center border-l border-border bg-muted/20">
          <AppOrbitImage />
        </div>
      </div>
    )
  }

  // Initial Reset Password view
  return (
    <div className="flex h-full w-full bg-background">
      {/* Left content */}
      <div className="flex w-1/2 flex-col justify-center px-16">
        <button
          onClick={onBack}
          className="mb-6 w-fit text-sm text-muted-foreground hover:underline"
        >
          Back
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground">
            Reset Password
          </h1>
          {isEditingEmail ? (
            <div className="mt-4">
              <label className="text-sm text-muted-foreground">
                Enter your email to receive a reset link
              </label>
              <input
                type="email"
                placeholder="Enter your email"
                value={editableEmail}
                onChange={e => setEditableEmail(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && emailOk) {
                    e.preventDefault()
                    handleContinue()
                  }
                }}
                className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground"
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              We'll send a reset link to {editableEmail}.{' '}
              <button
                onClick={() => setIsEditingEmail(true)}
                className="underline hover:text-foreground"
              >
                Change
              </button>
            </p>
          )}
        </div>

        <Button
          onClick={handleContinue}
          disabled={isLoading || !emailOk}
          className="h-10 w-full justify-center"
        >
          {isLoading ? 'Sending…' : 'Continue'}
        </Button>

        {error && (
          <p className="mt-2 text-center text-xs text-destructive">{error}</p>
        )}
      </div>

      {/* Right illustration */}
      <div className="flex w-1/2 items-center justify-center border-l border-border bg-muted/20">
        <AppOrbitImage />
      </div>
    </div>
  )
}
