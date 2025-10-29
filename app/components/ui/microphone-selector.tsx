import { Button } from '@/app/components/ui/button'
import { useEffect, useState } from 'react'
import {
  getAvailableMicrophones,
  microphoneToRender,
  Microphone,
} from '@/app/media/microphone'
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from '@/app/components/ui/dialog'

interface MicrophoneSelectorProps {
  selectedDeviceId?: string
  selectedMicrophoneName?: string
  onSelectionChange: (deviceId: string, name: string) => void
  triggerButtonText?: string
  triggerButtonVariant?:
    | 'default'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
    | 'destructive'
  triggerButtonClassName?: string
}

export function MicrophoneSelector({
  selectedDeviceId,
  selectedMicrophoneName,
  onSelectionChange,
  triggerButtonText = 'Select Microphone',
  triggerButtonVariant = 'outline',
  triggerButtonClassName = '',
}: MicrophoneSelectorProps) {
  const [availableMicrophones, setAvailableMicrophones] = useState<
    Array<Microphone>
  >([])
  const [tempSelectedMicrophone, setTempSelectedMicrophone] = useState<string>(
    selectedDeviceId || 'default',
  )
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const loadMicrophones = async () => {
      try {
        const mics = await getAvailableMicrophones()
        setAvailableMicrophones(mics)
      } catch (error) {
        console.error('Failed to load microphones:', error)
      }
    }
    // Only load microphones when the dialog is opened
    if (isOpen) {
      loadMicrophones()
    }
  }, [isOpen])

  useEffect(() => {
    setTempSelectedMicrophone(selectedDeviceId || 'default')
  }, [selectedDeviceId])

  const handleMicrophoneSelect = (deviceId: string) => {
    setTempSelectedMicrophone(deviceId)
  }

  const handleDialogClose = () => {
    if (tempSelectedMicrophone !== selectedDeviceId) {
      const selectedMic = availableMicrophones.find(
        mic => mic.deviceId === tempSelectedMicrophone,
      )
      const selectedMicName = selectedMic
        ? microphoneToRender(selectedMic).title
        : 'Auto-detect'
      onSelectionChange(tempSelectedMicrophone, selectedMicName)
    }
    setIsOpen(false)
  }

  // Use saved microphone name if available, otherwise fallback to looking it up
  const selectedMicrophoneDisplay =
    selectedMicrophoneName ||
    (() => {
      const foundMicrophone = availableMicrophones.find(
        mic => mic.deviceId === selectedDeviceId,
      )
      return foundMicrophone
        ? microphoneToRender(foundMicrophone).title
        : 'Auto-detect'
    })()

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant={triggerButtonVariant}
          className={triggerButtonClassName}
          type="button"
        >
          {triggerButtonText === 'Select Microphone' &&
          (selectedMicrophoneName || selectedDeviceId)
            ? selectedMicrophoneDisplay
            : triggerButtonText}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="!border-0 shadow-lg p-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Select Microphone</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a microphone from the list below to use for voice input
        </DialogDescription>
        <div className="max-h-[60vh] overflow-y-auto space-y-3 pl-8 pr-6 pt-8">
          {availableMicrophones.map(mic => {
            const { title, description } = microphoneToRender(mic)
            return (
              <div
                key={mic.deviceId}
                className={`p-6 rounded-md cursor-pointer transition-colors max-w-full overflow-hidden ${
                  tempSelectedMicrophone === mic.deviceId
                    ? 'bg-purple-50 border-2 border-purple-100'
                    : 'bg-neutral-100 border-2 border-neutral-100 hover:bg-neutral-200'
                }`}
                onClick={() => handleMicrophoneSelect(mic.deviceId)}
                style={{ minWidth: 0 }}
              >
                <div
                  className="font-medium text-base truncate"
                  style={{ maxWidth: '100%' }}
                >
                  {title}
                </div>
                {description && (
                  <div
                    className="text-sm text-muted-foreground text-wrap mt-2"
                    style={{ maxWidth: '100%' }}
                  >
                    {description}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex justify-end px-8 pb-8 pt-6">
          <DialogClose asChild>
            <Button className="w-32" type="button" onClick={handleDialogClose}>
              Save and close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
