import { AppOrbitImage } from '../../ui/app-orbit-image'

type Props = {
  onBack: () => void
}

export default function ResetPassword({ onBack }: Props) {
  return (
    <div className="flex h-full w-full bg-background">
      <div className="flex w-1/2 flex-col justify-center px-16">
        <button
          onClick={onBack}
          className="mb-6 w-fit text-sm text-muted-foreground hover:underline"
        >
          Back
        </button>
      </div>
      <div className="flex w-1/2 items-center justify-center border-l border-border bg-muted/20">
        <AppOrbitImage />
      </div>
    </div>
  )
}
