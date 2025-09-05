import { useMemo, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { AppOrbitImage } from '@/app/components/ui/app-orbit-image'
import { isValidEmail, isStrongPassword } from '@/app/utils/utils'
import { useAuth } from '@/app/components/auth/useAuth'
import CheckEmailContent from './CheckEmailContent'
import { EXTERNAL_LINKS } from '@/lib/constants/external-links'

type Props = {
  initialEmail?: string
  onBack: () => void
  onContinue: (email: string, password?: string) => void
}

export default function EmailPasswordContent({
  initialEmail = '',
  onBack,
  onContinue,
}: Props) {
  const email = initialEmail
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')

  const emailOk = useMemo(() => isValidEmail(email), [email])

  const isValid = useMemo(() => {
    const passwordOk = isStrongPassword(password)
    const nameOk = fullName.trim().length > 0
    return emailOk && passwordOk && nameOk
  }, [emailOk, password, fullName])

  const { createDatabaseUser } = useAuth()
  const [showCheckEmail, setShowCheckEmail] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [dbUserId, setDbUserId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!emailOk || !isStrongPassword(password) || !fullName.trim()) return
    try {
      setIsCreating(true)
      setErrorMessage(null)
      const res = await createDatabaseUser(email, password, fullName.trim())
      setDbUserId(`auth0|${res._id}`)
      setShowCheckEmail(true)
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateSafe = async () => {
    try {
      await handleCreate()
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : 'Signup failed.'
      console.error('Signup error:', e)
      setErrorMessage(msg)
    }
  }

  if (showCheckEmail) {
    return (
      <CheckEmailContent
        email={email}
        dbUserId={dbUserId}
        onUseAnotherEmail={onBack}
      />
    )
  }

  return (
    <div className="flex h-full w-full bg-background">
      {/* Left: form */}
      <div className="flex w-1/2 flex-col justify-center px-16">
        {/* Back */}
        <button
          onClick={onBack}
          className="mb-6 w-fit text-sm text-muted-foreground hover:underline"
        >
          Back
        </button>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This will take just a minute
          </p>
        </div>

        {/* Fields */}
        <div className="space-y-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground">Email</label>
            <div className="h-10 w-full rounded-md border border-border bg-muted px-3 text-foreground flex items-center">
              <span className="truncate" title={email}>
                {email}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground">Full name</label>
            <input
              type="text"
              placeholder="Enter your Full name"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Must be 8+ chars, include upper, lower, and number
            </p>
          </div>

          <Button
            className="h-10 w-full"
            disabled={!isValid || isCreating}
            aria-busy={isCreating}
            onClick={handleCreateSafe}
          >
            {isCreating && (
              <span className="mr-2 inline-block size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            )}
            {isCreating ? 'Creating…' : 'Create Account'}
          </Button>

          {errorMessage && (
            <p className="mt-2 text-sm text-destructive">{errorMessage}</p>
          )}

          <p className="text-center text-xs text-muted-foreground">
            By continuing, you agree to our{' '}
            <a
              href={EXTERNAL_LINKS.WEBSITE}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Terms
            </a>{' '}
            and{' '}
            <a
              href={EXTERNAL_LINKS.PRIVACY_POLICY}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Privacy Policy
            </a>
          </p>
        </div>
      </div>

      {/* Right: orbit illustration */}
      <div className="flex w-1/2 items-center justify-center border-l border-border bg-muted/20">
        <AppOrbitImage />
      </div>
    </div>
  )
}
