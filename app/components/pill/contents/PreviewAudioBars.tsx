import { AudioBarsBase } from './AudioBarsBase'

export const PreviewAudioBars = () => {
  // Create varied static heights for a nice preview effect
  const staticHeights = [
    3, 7, 4, 9, 12, 6, 8, 11, 5, 14, 6, 1, 1, 9, 15, 11, 7, 13, 9, 3, 2,
  ]

  return <AudioBarsBase heights={staticHeights} barColor="#FFFFFF" />
}
