import { AudioBarsBase } from './AudioBarsBase'

export const PreviewAudioBars = () => {
  // Create varied static heights for a nice preview effect
  const staticHeights = [
    3, 7, 4, 9, 12, 6, 8, 11, 5, 14, 9, 7, 13, 6, 1, 1, 1, 1, 9, 15, 11, 7, 6,
    13, 9, 8, 10, 5, 12, 7, 14, 6, 1, 1, 2, 5, 13, 10, 7, 12, 6, 9,
  ]

  return <AudioBarsBase heights={staticHeights} barColor="#9CA3AF" />
}
