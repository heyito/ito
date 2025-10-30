import React from 'react'
import { Check } from '@mynaui/icons-react'
import { Dialog, DialogContent, DialogFooter } from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import proBannerImage from '@/app/assets/pro-banner.png'

interface ProUpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProUpgradeDialog({
  open,
  onOpenChange,
}: ProUpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-none">
        {/* Banner Header with Image */}
        <div
          className="relative px-8 py-12 text-center bg-cover bg-center"
          style={{ backgroundImage: `url(${proBannerImage})` }}
        >
          {/* PRO Badge */}
          <div className="relative inline-block mb-6">
            <div className="bg-white rounded-full px-12 py-4 shadow-lg">
              <span className="text-5xl font-black bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                PRO
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6 bg-white">
          <h2 className="text-3xl font mb-2 ">
            Congrats! You have been{' '}
            <span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
              upgraded to Ito Pro for free!
            </span>
          </h2>

          <p className="text-l text-gray-600  mb-6">
            Enjoy all Pro features for{' '}
            <span className="font-semibold">14 days</span>.
          </p>

          {/* Features List */}
          <div className="space-y-3 mb-6 border border-gray-200 rounded-lg p-4">
            <FeatureItem text="Unlimited words per week" />
            <FeatureItem text="Ultra fast dictation as fast as 0.3 second" />
            <FeatureItem text="Priority customer support" />
            <FeatureItem text="Early access to new functionality" />
          </div>

          {/* Buttons */}
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button
              onClick={() => onOpenChange(false)}
              variant="default"
              size="lg"
              className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl"
            >
              Try for free
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              size="lg"
              className="rounded-xl border-gray-200"
            >
              Upgrade Now <span className="text-gray-500">(20% off)</span>
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0">
        <Check className="w-5 h-5" strokeWidth={3} />
      </div>
      <span className="text-gray-900">{text}</span>
    </div>
  )
}
