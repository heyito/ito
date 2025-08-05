interface AudioBarsBaseProps {
  heights: number[]
  barColor: string
}

export const BAR_COUNT = 21

export const AudioBarsBase = ({ heights, barColor }: AudioBarsBaseProps) => {
  const barStyle = (height: number): React.CSSProperties => {
    return {
      width: '2px',
      backgroundColor: barColor,
      borderRadius: '2.5px',
      margin: '0 0.25px',
      height: `${height}px`,
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
      }}
    >
      {heights.map((height, i) => (
        <div key={i} style={barStyle(height)} />
      ))}
    </div>
  )
}
