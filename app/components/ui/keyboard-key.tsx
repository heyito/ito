import { ComponentPropsWithoutRef } from 'react'
import clsx from 'clsx'
import { cx } from 'class-variance-authority'

const FnKey = () => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 80 80"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g transform="translate(15, 46)">
      <circle cx="9" cy="9" r="8" fill="none" stroke="#666" strokeWidth="1.5" />
      <line x1="9" y1="1" x2="9" y2="17" stroke="#666" strokeWidth="1.2" />
      <line x1="1" y1="9" x2="17" y2="9" stroke="#666" strokeWidth="1.2" />
      <path
        d="M9 1 C4.5 4.5 4.5 13.5 9 17"
        fill="none"
        stroke="#666"
        strokeWidth="1"
      />
      <path
        d="M9 1 C13.5 4.5 13.5 13.5 9 17"
        fill="none"
        stroke="#666"
        strokeWidth="1"
      />
      <path
        d="M2.5 5.5 C5.5 4.5 12.5 4.5 15.5 5.5"
        fill="none"
        stroke="#666"
        strokeWidth="1"
      />
      <path
        d="M2.5 12.5 C5.5 13.5 12.5 13.5 15.5 12.5"
        fill="none"
        stroke="#666"
        strokeWidth="1"
      />
    </g>
    <text
      x="56"
      y="28"
      fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif"
      fontSize="16"
      fontWeight="400"
      fill="#333"
      textAnchor="middle"
    >
      fn
    </text>
  </svg>
)

type modifierKey = 'control' | 'option' | 'command'
type modifierKeySymbol = '⌃' | '⌥' | '⌘'

const ModifierKey = ({
  keyboardKey,
  symbol,
}: {
  keyboardKey: modifierKey
  symbol: modifierKeySymbol
}) => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 80 80"
    xmlns="http://www.w3.org/2000/svg"
  >
    <text
      x="54"
      y="28"
      fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif"
      fontSize="20"
      fontWeight="400"
      fill="#666"
      textAnchor="middle"
    >
      {symbol}
    </text>
    <text
      x="40"
      y="65"
      fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif"
      fontSize="14"
      fontWeight="400"
      fill="#666"
      textAnchor="middle"
    >
      {keyboardKey}
    </text>
  </svg>
)

const DefaultKey = ({ keyboardKey }: { keyboardKey: string }) => {
  let label = keyboardKey
  if (/^[a-zA-Z]$/.test(label)) label = label.toUpperCase()
  let fontSize = 20
  if (label.length > 3) fontSize = 18
  if (label.length > 6) fontSize = 16
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 80 80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="40"
        y="44"
        fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif"
        fontSize={fontSize}
        fontWeight="400"
        fill="#666"
        textAnchor="middle"
      >
        {label}
      </text>
    </svg>
  )
}

const KeyToRender = ({ keyboardKey }: { keyboardKey: string }) => {
  switch (keyboardKey) {
    case 'fn':
      return <FnKey />
    case 'control':
      return <ModifierKey keyboardKey="control" symbol="⌃" />
    case 'option':
      return <ModifierKey keyboardKey="option" symbol="⌥" />
    case 'command':
      return <ModifierKey keyboardKey="command" symbol="⌘" />
    default:
      return <DefaultKey keyboardKey={keyboardKey} />
  }
}

/* ---------------- New inline (pill) rendering ---------------- */

function inlineLabel(key: string) {
  if (key.length === 1) return key.toUpperCase()
  switch (key) {
    case 'command':
      return '⌘'
    case 'option':
      return '⌥'
    case 'control':
      return '⌃'
    case 'shift':
      return '⇧'
    case 'fn':
      return 'fn'
    default:
      return key
  }
}

/* ---------------- Component ---------------- */

interface KeyboardKeyProps extends ComponentPropsWithoutRef<'div'> {
  keyboardKey: string
  /** 'tile' = big square SVG (default). 'inline' = small pill for rows/inline usage. */
  variant?: 'tile' | 'inline'
  /** Optional compact size for the tile variant */
  size?: 'md' | 'sm'
}

export default function KeyboardKey({
  keyboardKey,
  className,
  variant = 'tile',
  ...props
}: KeyboardKeyProps) {
  if (variant === 'inline') {
    // Text pill — matches your compact mock
    return (
      <span
        className={clsx(
          'inline-flex select-none items-center justify-center rounded-xl border border-neutral-300',
          'bg-neutral-100 px-2.5 py-1 text-sm leading-5 text-neutral-900 shadow-sm',
          className,
        )}
        {...props}
      >
        {inlineLabel(keyboardKey)}
      </span>
    )
  }

  return (
    <div className={cx('rounded-lg shadow-lg', className)} {...props}>
      <KeyToRender keyboardKey={keyboardKey} />
    </div>
  )
}
