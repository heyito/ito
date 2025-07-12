import React from 'react'

interface IMessageIconProps extends React.SVGProps<SVGSVGElement> {
  width?: number
  height?: number
  className?: string
  style?: React.CSSProperties
}

export default function IMessageIcon({
  width = 24,
  height = 24,
  className,
  style,
  ...props
}: IMessageIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 66.145836 66.145836"
      className={className}
      style={style}
      fill="none"
      {...props}
    >
      <defs>
        <linearGradient
          id="imessage-gradient"
          x1="-25.272568"
          y1="207.52057"
          x2="-25.272568"
          y2="152.9982"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#0cbd2a" />
          <stop offset="1" stopColor="#5bf675" />
        </linearGradient>
      </defs>
      <rect
        ry="14.567832"
        rx="14.567832"
        y="0"
        x="0"
        height="66.145836"
        width="66.145836"
        style={{ fill: 'url(#imessage-gradient)' }}
      />
      <path
        d="M32.072918,11.45046a24.278298,20.222157 0 0 0-24.278105,20.22202 24.278298,20.222157 0 0 0 11.79463,17.31574 27.365264,20.222157 0 0 1-4.245218,5.94228 23.85735,20.222157 0 0 0 9.86038-3.87367 24.278298,20.222157 0 0 0 6.868313,0.83768 24.278298,20.222157 0 0 0 24.278106-20.22203 24.278298,20.222157 0 0 0-24.278106-20.22202z"
        style={{ fill: '#fff' }}
      />
    </svg>
  )
}
