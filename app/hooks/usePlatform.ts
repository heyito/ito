import { useState, useEffect } from 'react'

type Platform = 'darwin' | 'win32'

export function usePlatform(): Platform | undefined {
  const [platform, setPlatform] = useState<Platform | undefined>(undefined)

  useEffect(() => {
    window.api.getPlatform().then(setPlatform)
  }, [])

  return platform
}
