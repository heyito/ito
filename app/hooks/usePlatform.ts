import { useState, useEffect } from 'react'

type Platform = 'darwin' | 'win32' | 'linux'

export function usePlatform(): Platform | null {
  const [platform, setPlatform] = useState<Platform | null>(null)

  useEffect(() => {
    window.api.getPlatform().then(setPlatform)
  }, [])

  return platform
}