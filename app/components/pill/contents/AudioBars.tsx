import { useEffect, useState } from 'react'
import { AudioBarsBase, BAR_COUNT } from './AudioBarsBase'

// A new component to very basic audio visualization
export const AudioBars = ({
  volumeHistory,
  barColor = 'white',
}: {
  volumeHistory: number[]
  barColor?: string
}) => {
  // Base heights for visual variety
  const bars = Array(BAR_COUNT).fill(1)
  const [activeBarIndex, setActiveBarIndex] = useState(0)

  useEffect(() => {
    setActiveBarIndex(prevIndex => (prevIndex + 1) % bars.length)
  }, [volumeHistory, bars.length])

  // Calculate dynamic heights based on volume and active bar
  const dynamicHeights = bars.map((baseHeight, index) => {
    const volume = volumeHistory[volumeHistory.length - index - 1] || 0
    const scale = Math.max(0.05, Math.min(1, volume * 20))
    const activeBarHeight = index === activeBarIndex ? 2 : 0
    const height = activeBarHeight + baseHeight * 20 * scale
    return Math.min(Math.max(height, 1), 16)
  })

  return <AudioBarsBase heights={dynamicHeights} barColor={barColor} />
}
