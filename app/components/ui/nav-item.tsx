import { ReactNode } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip'

interface NavItemProps {
  icon: ReactNode
  label: string
  isActive?: boolean
  showText: boolean
  onClick?: () => void
}

export function NavItem({
  icon,
  label,
  isActive = false,
  showText,
  onClick,
}: NavItemProps) {
  const navContent = (
    <div
      className={`flex items-center px-3 py-3 rounded cursor-pointer ${
        isActive ? 'bg-slate-200 font-medium' : 'hover:bg-slate-200'
      }`}
      onClick={onClick}
    >
      <div className="w-6 flex items-center justify-center">{icon}</div>
      <span
        className={`transition-opacity duration-100 ${
          showText ? 'opacity-100' : 'opacity-0'
        } ${showText ? 'ml-2' : 'w-0 overflow-hidden'}`}
      >
        {label}
      </span>
    </div>
  )

  if (!showText) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{navContent}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={2} className="text-sm">
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return navContent
}
