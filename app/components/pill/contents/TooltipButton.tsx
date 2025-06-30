import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/app/components/ui/tooltip'

interface TooltipButtonProps {
  onClick: (e: React.MouseEvent) => void
  icon: React.ReactNode
  tooltip: string
}

export const TooltipButton: React.FC<TooltipButtonProps> = ({
  onClick,
  icon,
  tooltip,
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        onClick={onClick}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: '4px',
        }}
      >
        {icon}
      </button>
    </TooltipTrigger>
    <TooltipContent
      side="top"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '6px 8px',
        fontSize: '14px',
        marginBottom: '6px',
      }}
      className="border-none rounded-md"
    >
      {tooltip}
    </TooltipContent>
  </Tooltip>
)
