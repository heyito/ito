import { useEffect, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { AppOrbitImage } from '@/app/components/ui/app-orbit-image'

type Props = {
  email: string
  onUseAnotherEmail: () => void
  onResend?: () => Promise<void> | void
}

export default function CheckEmailContent({
  email,
  onUseAnotherEmail,
  onResend,
}: Props) {
  const [seconds, setSeconds] = useState(60)
  const [isResending, setIsResending] = useState(false)

  useEffect(() => {
    if (seconds <= 0) return
    const id = setInterval(() => setSeconds(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [seconds])

  const handleResend = async () => {
    if (seconds > 0 || isResending) return
    try {
      setIsResending(true)
      await onResend?.()
      setSeconds(60)
    } finally {
      setIsResending(false)
    }
  }

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
      </div>

      {/* Right illustration */}
      <div className="flex w-1/2 items-center justify-center border-l border-border bg-muted/20">
        <AppOrbitImage />
      </div>
    </div>
  )
}
