import { useMemo, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { AppOrbitImage } from '@/app/components/ui/app-orbit-image'
import { isValidEmail, isStrongPassword } from '@/app/utils/utils'
import { useAuth } from '@/app/components/auth/useAuth'
import ResetPassword from './ResetPassword'

type Props = {
  initialEmail?: string
  onBack: () => void
  onContinue: (email: string, password?: string) => void
}

export default function EmailLoginContent({
  initialEmail = '',
  onBack,
}: Props) {
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')

  const emailOk = useMemo(() => isValidEmail(email), [email])

  const isValid = useMemo(() => {
    const passwordOk = isStrongPassword(password)
    return emailOk && passwordOk
  }, [emailOk, password])

  const { loginWithEmailPassword } = useAuth()
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleLogin = async () => {
    if (!emailOk || !isStrongPassword(password)) return
    try {
      setIsLoggingIn(true)
      setErrorMessage(null)
      await loginWithEmailPassword(email, password, { skipNavigate: true })
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : 'Login failed.'
      console.error('Login error:', e)
      setErrorMessage(msg)
    } finally {
      setIsLoggingIn(false)
    }
  }

  if (showResetPassword) {
    return (
      <ResetPassword
        email={emailOk ? email : undefined}
        onBack={() => setShowResetPassword(false)}
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
            Welcome back!
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Log in to get started
          </p>
        </div>

        {/* Fields */}
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
                  handleLogin()
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
            onClick={handleLogin}
          >
            {isLoggingIn && (
              <span className="mr-2 inline-block size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            )}
            {isLoggingIn ? 'Logging in…' : 'Log In'}
          </Button>

          {errorMessage && (
            <p className="mt-2 text-sm text-destructive">{errorMessage}</p>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button className="hover:underline" onClick={onBack}>
              Log in with a different email
            </button>
            <button
              className="hover:underline"
              onClick={() => setShowResetPassword(true)}
            >
              Forgot password?
            </button>
          </div>
        </div>
      </div>

      {/* Right: orbit illustration */}
      <div className="flex w-1/2 items-center justify-center border-l border-border bg-muted/20">
        <AppOrbitImage />
      </div>
    </div>
  )
}
