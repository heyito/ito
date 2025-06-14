import { ComponentPropsWithoutRef } from 'react'

const FnKey = () => {
  return (
    <svg width="100%" height="100%" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      {/* Globe icon in bottom left */}
      <g transform="translate(15, 46)">
        <circle cx="9" cy="9" r="8" fill="none" stroke="#666" strokeWidth="1.5" />
        {/* Vertical meridian */}
        <line x1="9" y1="1" x2="9" y2="17" stroke="#666" strokeWidth="1.2" />
        {/* Horizontal equator */}
        <line x1="1" y1="9" x2="17" y2="9" stroke="#666" strokeWidth="1.2" />
        {/* Curved meridians */}
        <path d="M9 1 C4.5 4.5 4.5 13.5 9 17" fill="none" stroke="#666" strokeWidth="1" />
        <path d="M9 1 C13.5 4.5 13.5 13.5 9 17" fill="none" stroke="#666" strokeWidth="1" />
        {/* Latitude curves */}
        <path d="M2.5 5.5 C5.5 4.5 12.5 4.5 15.5 5.5" fill="none" stroke="#666" strokeWidth="1" />
        <path d="M2.5 12.5 C5.5 13.5 12.5 13.5 15.5 12.5" fill="none" stroke="#666" strokeWidth="1" />
      </g>
      {/* "fn" text in top right */}
      <text x="56" y="28" fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif" fontSize="16" fontWeight="400" fill="#333" textAnchor="middle">fn</text>
    </svg>
  )
}
type modifierKey = 'control' | 'option' | 'command'
type modifierKeySymbol = '⌃' | '⌥' | '⌘'

const ModifierKey = ({ keyboardKey, symbol }: { keyboardKey: modifierKey, symbol: modifierKeySymbol }) => {
  return (
    <svg width="100%" height="100%" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <text x="54" y="28" fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif" fontSize="20" fontWeight="400" fill="#666" textAnchor="middle">
        {symbol}
      </text>
      <text x="40" y="65" fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif" fontSize="14" fontWeight="400" fill="#666" textAnchor="middle">
        {keyboardKey}
      </text>
    </svg>
  )
}

const DefaultKey = ({ keyboardKey }: { keyboardKey: string }) => {
  // If the keyboardKey is a single letter, make it uppercase
  if (keyboardKey.match(/^[a-zA-Z]$/)) {
    keyboardKey = keyboardKey.toUpperCase()
  }
  let fontSize = 20
  if (keyboardKey.length > 3) fontSize = 18
  if (keyboardKey.length > 6) fontSize = 16

  return (
    <svg width="100%" height="100%" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <text x="40" y="44" fontFamily="SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif" fontSize={fontSize} fontWeight="400" fill="#666" textAnchor="middle">
        {keyboardKey}
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

interface KeyboardKeyProps extends ComponentPropsWithoutRef<'div'> {
  keyboardKey: string
}

export default function KeyboardKey({ keyboardKey, className, ...props }: KeyboardKeyProps) {
  return (
    <div className={`rounded-lg shadow-lg ${className}`} {...props}>
      <KeyToRender keyboardKey={keyboardKey} />
    </div>
  )
}