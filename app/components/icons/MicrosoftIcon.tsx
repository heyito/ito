import React from 'react'

interface MicrosoftIconProps {
  width?: number
  height?: number
  className?: string
}

export default function MicrosoftIcon({
  width = 20,
  height = 20,
  className,
}: MicrosoftIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      x="0px"
      y="0px"
      width={width}
      height={height}
      viewBox="0 0 48 48"
      className={className}
    >
      <path
        fill="#ff5722"
        d="M6 6H22V22H6z"
        transform="rotate(-180 14 14)"
      ></path>
      <path
        fill="#4caf50"
        d="M26 6H42V22H26z"
        transform="rotate(-180 34 14)"
      ></path>
      <path
        fill="#ffc107"
        d="M26 26H42V42H26z"
        transform="rotate(-180 34 34)"
      ></path>
      <path
        fill="#03a9f4"
        d="M6 26H22V42H6z"
        transform="rotate(-180 14 34)"
      ></path>
    </svg>
  )
}
