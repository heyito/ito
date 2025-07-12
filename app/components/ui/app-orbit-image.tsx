import ItoIcon from '../icons/ItoIcon'
import GitHubIcon from '../icons/GitHubIcon'
import NotionIcon from '../icons/NotionIcon'
import SlackIcon from '../icons/SlackIcon'
import CursorIcon from '../icons/CursorIcon'
import AppleNotesIcon from '../icons/AppleNotesIcon'
import ChatGPTIcon from '../icons/ChatGPTIcon'
import IMessageIcon from '../icons/IMessageIcon'
import GmailIcon from '../icons/GmailIcon'
import VSCodeIcon from '../icons/VSCodeIcon'
import ClaudeIcon from '../icons/ClaudeIcon'

import React from 'react'

const orbitIcons = [
  {
    icon: <AppleNotesIcon className="size-16" />,
    bg: '#fff',
    angle: 10,
    radius: 280,
    rotation: 12,
  },
  {
    icon: <ClaudeIcon className="size-16" />,
    bg: '#fff',
    angle: 40,
    radius: 280,
    rotation: -15,
  },
  {
    icon: <ChatGPTIcon className="size-16" />,
    bg: '#fff',
    angle: 160,
    radius: 280,
    rotation: 18,
  },
  {
    icon: <SlackIcon className="size-16" />,
    bg: '#fff',
    angle: 200,
    radius: 280,
    rotation: -10,
  },
  {
    icon: <IMessageIcon className="size-16" />,
    bg: '#fff',
    angle: 240,
    radius: 280,
    rotation: 20,
  },
  {
    icon: <VSCodeIcon className="size-16" />,
    bg: '#fff',
    angle: 310,
    radius: 280,
    rotation: -8,
  },
  {
    icon: <CursorIcon className="size-16" />,
    bg: '#fff',
    angle: 340,
    radius: 280,
    rotation: 14,
  },
]

const innerOrbitIcons = [
  {
    icon: <GmailIcon className="size-16" />,
    bg: '#fff',
    angle: 0,
    radius: 180,
    rotation: -18,
  },
  {
    icon: <NotionIcon className="size-16" />,
    bg: '#fff',
    angle: 130,
    radius: 180,
    rotation: 16,
  },
  {
    icon: <GitHubIcon className="size-16" />,
    bg: '#fff',
    angle: 220,
    radius: 180,
    rotation: -20,
  },
]

export function AppOrbitImage() {
  return (
    <div className="relative w-[560px] h-[560px] flex items-center justify-center select-none">
      {/* Concentric Circles */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        {/* Outer orbit circle with horizontal gradient fade (top/bottom faded) */}
        <svg
          width="560"
          height="560"
          className="absolute"
          style={{ left: 0, top: 0 }}
        >
          <circle
            cx="280"
            cy="280"
            r="279"
            fill="none"
            stroke="url(#outerGradient)"
            strokeWidth="1"
            opacity="0.5"
          />
          <defs>
            <linearGradient
              id="outerGradient"
              x1="0"
              y1="280"
              x2="560"
              y2="280"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#A8A8A8" />
              <stop offset="0.278846" stopColor="#A8A8A8" stopOpacity="0" />
              <stop offset="0.6875" stopColor="#A8A8A8" stopOpacity="0" />
              <stop offset="1" stopColor="#A8A8A8" />
            </linearGradient>
          </defs>
        </svg>
        {/* Inner orbit circle with horizontal gradient fade (top/bottom faded) */}
        <svg
          width="360"
          height="360"
          className="absolute"
          style={{ left: 100, top: 100 }}
        >
          <circle
            cx="180"
            cy="180"
            r="179"
            fill="none"
            stroke="url(#innerGradient)"
            strokeWidth="1"
            opacity="0.5"
          />
          <defs>
            <linearGradient
              id="innerGradient"
              x1="0"
              y1="180"
              x2="360"
              y2="180"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#A8A8A8" />
              <stop offset="0.278846" stopColor="#A8A8A8" stopOpacity="0" />
              <stop offset="0.6875" stopColor="#A8A8A8" stopOpacity="0" />
              <stop offset="1" stopColor="#A8A8A8" />
            </linearGradient>
          </defs>
        </svg>
        {/* Center Ito icon circle (provided SVG, horizontal gradient fade) */}
        <svg
          width="195"
          height="196"
          viewBox="0 0 195 196"
          fill="none"
          className="absolute"
          style={{ left: 182.5, top: 182 }}
        >
          <circle
            opacity="0.5"
            cx="97.6547"
            cy="98.0002"
            r="96.9619"
            transform="rotate(0 97.6547 98.0002)"
            stroke="url(#itoGradient)"
            strokeWidth="0.609703"
          />
          <defs>
            <linearGradient
              id="itoGradient"
              x1="0"
              y1="98"
              x2="195"
              y2="98"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#A8A8A8" />
              <stop offset="0.278846" stopColor="#A8A8A8" stopOpacity="0" />
              <stop offset="0.6875" stopColor="#A8A8A8" stopOpacity="0" />
              <stop offset="1" stopColor="#A8A8A8" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      {/* Outer orbit icons */}
      {orbitIcons.map(({ icon, angle, radius, bg, rotation }, i) => {
        const rad = (angle * Math.PI) / 180
        const x = Math.cos(rad) * radius
        const y = Math.sin(rad) * radius
        return (
          <div
            key={`outer-${i}`}
            className="absolute"
            style={{
              left: `calc(50% + ${x}px - 32px)`,
              top: `calc(50% + ${y}px - 32px)`,
            }}
          >
            <div
              className="rounded-xl shadow-md flex items-center justify-center p-2"
              style={{
                background: bg,
                width: 64,
                height: 64,
                transform: `rotate(${rotation}deg)`,
              }}
            >
              {icon}
            </div>
          </div>
        )
      })}
      {/* Inner orbit icons */}
      {innerOrbitIcons.map(({ icon, angle, radius, bg, rotation }, i) => {
        const rad = (angle * Math.PI) / 180
        const x = Math.cos(rad) * radius
        const y = Math.sin(rad) * radius
        return (
          <div
            key={`inner-${i}`}
            className="absolute"
            style={{
              left: `calc(50% + ${x}px - 32px)`,
              top: `calc(50% + ${y}px - 32px)`,
            }}
          >
            <div
              className="rounded-xl shadow flex items-center justify-center p-2"
              style={{
                background: bg,
                width: 64,
                height: 64,
                transform: `rotate(${rotation}deg)`,
              }}
            >
              {icon}
            </div>
          </div>
        )
      })}
      {/* Center Ito icon */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-black rounded-full w-20 h-20 flex items-center justify-center shadow-lg">
        <ItoIcon height={48} width={48} style={{ color: '#fff' }} />
      </div>
    </div>
  )
}
