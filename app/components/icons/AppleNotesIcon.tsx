import React from 'react'

interface AppleNotesIconProps extends React.SVGProps<SVGSVGElement> {
  width?: number
  height?: number
  className?: string
  style?: React.CSSProperties
}

export default function AppleNotesIcon({
  width = 24,
  height = 24,
  className,
  style,
  ...props
}: AppleNotesIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 120 120"
      className={className}
      style={style}
      fill="none"
      {...props}
    >
      <defs>
        <linearGradient
          id="apple-notes-gradient"
          x1="50%"
          x2="50%"
          y1="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#F4D87E" />
          <stop offset="100%" stopColor="#F5C52C" />
        </linearGradient>
        <filter
          id="apple-notes-shadow"
          width="110.2%"
          height="146.7%"
          x="-5.1%"
          y="-16.7%"
          filterUnits="objectBoundingBox"
        >
          <feOffset dy="2" in="SourceAlpha" result="shadowOffsetOuter1" />
          <feGaussianBlur
            in="shadowOffsetOuter1"
            result="shadowBlurOuter1"
            stdDeviation="2"
          />
          <feColorMatrix
            in="shadowBlurOuter1"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0"
          />
        </filter>
      </defs>
      <rect width="120" height="120" rx="28" fill="#FFF" />
      <g>
        <g>
          <g>
            <g filter="url(#apple-notes-shadow)">
              <rect
                x="-9"
                y="0"
                width="137"
                height="30"
                fill="url(#apple-notes-gradient)"
              />
            </g>
            <rect
              x="-9"
              y="0"
              width="137"
              height="30"
              fill="url(#apple-notes-gradient)"
            />
          </g>
        </g>
      </g>
      <rect y="59" width="120" height="2" fill="#C7C5C9" />
      <rect y="89" width="120" height="2" fill="#C7C5C9" />
      <g fill="#C2C0C4">
        {[...Array(24)].map((_, i) => (
          <circle key={i} cx={1.5 + 5 * i} cy={36.5} r={1.5} />
        ))}
      </g>
    </svg>
  )
}
