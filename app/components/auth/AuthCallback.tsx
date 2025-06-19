import { useAuth0 } from '@auth0/auth0-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ItoIcon from '../icons/ItoIcon'

export default function AuthCallback() {
  const { isLoading, error, isAuthenticated } = useAuth0()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        // Redirect to main app after successful authentication
        navigate('/')
      } else if (error) {
        console.error('Authentication error:', error)
        // Redirect to main app even on error to show error state
        navigate('/')
      }
    }
  }, [isLoading, isAuthenticated, error, navigate])

  return (
    <div className="flex flex-col h-full w-full bg-background items-center justify-center">
      <div className="flex flex-col items-center max-w-md w-full px-8">
        <div className="mb-8">
          <ItoIcon />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-semibold mb-3 text-foreground">
            {error ? 'Authentication Failed' : 'Completing Sign In...'}
          </h1>
          <p className="text-muted-foreground text-base">
            {error 
              ? 'There was an error signing you in. Redirecting...'
              : 'Please wait while we complete your authentication.'
            }
          </p>
          {error && (
            <p className="text-red-500 text-sm mt-2">
              {error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
} 