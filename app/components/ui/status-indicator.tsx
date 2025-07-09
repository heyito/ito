import { useEffect, useState } from 'react'
import { Check, X } from '@mynaui/icons-react'

interface StatusIndicatorProps {
  status: 'success' | 'error' | null
  onHide?: () => void
  duration?: number
  successMessage?: string
  errorMessage?: string
}

export function StatusIndicator({
  status,
  onHide,
  duration = 2000,
  successMessage = 'Operation completed successfully',
  errorMessage = 'Operation failed',
}: StatusIndicatorProps) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (status) {
      setIsExiting(false)
      const timer = setTimeout(() => {
        setIsExiting(true)
        setTimeout(() => {
          onHide?.()
        }, 300) // Wait for exit animation
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [status, duration, onHide])

  if (!status) return null

  return (
    <div
      className={`fixed bottom-6 right-6 z-500 transition-all duration-300 ease-out ${
        isExiting
          ? 'translate-y-[-20px] opacity-0'
          : 'translate-y-0 opacity-100 animate-slide-up'
      }`}
    >
      <div className="px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 bg-black text-white">
        {status === 'success' ? (
          <>
            <Check className="w-4 h-4 text-green-400" />
            <span className="font-medium">{successMessage}</span>
          </>
        ) : (
          <>
            <X className="w-4 h-4 text-red-400" />
            <span className="font-medium">{errorMessage}</span>
          </>
        )}
      </div>
    </div>
  )
}
