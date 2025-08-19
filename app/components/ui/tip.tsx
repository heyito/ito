import { InfoCircleSolid } from '@mynaui/icons-react'
import { cx } from 'class-variance-authority'

export function Tip({
  tipText,
  className,
}: {
  tipText: string
  className?: string
}) {
  const baseClass = 'flex gap-2 items-center '
  return (
    <div className={cx(baseClass, className)}>
      <span className="align-middle inline-flex">
        <InfoCircleSolid className="fill-blue-400 h-6 w-6" />
      </span>
      <span>
        <span className="font-semibold">Tip:</span> {tipText}
      </span>
    </div>
  )
}
