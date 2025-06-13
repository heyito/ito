import { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { CheckCircle, Lock } from "@mynaui/icons-react";

export default function DataControlContent({ onBack, onContinue }: { onBack?: () => void, onContinue?: () => void }) {
  const [selected, setSelected] = useState<'help' | 'privacy' | null>('help')

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start pl-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12">
          <div className="mt-8">
            <button className="mb-4 text-sm text-muted-foreground hover:underline" type="button" onClick={onBack}>&lt; Back</button>
            <h1 className="text-3xl mb-4 mt-12">You control your data</h1>
            <div className="flex flex-col gap-4 my-8 pr-24">
              <div
                className={`border rounded-lg p-4 cursor-pointer transition-all ${selected === 'help' ? 'border-green-200 bg-green-50 border-2' : 'border-border border-2 bg-background'}`}
                onClick={() => setSelected('help')}
              >
                <div className="flex items-center justify-between w-full my-2">
                  <div className="font-medium">Help improve Ito</div>
                  {selected === 'help' && (
                    <div><CheckCircle style={{ color: '#22c55e', width: 18, height: 18 }} /></div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground max-w-md mt-1">
                  To make Ito better, this option lets us collect your audio, transcript, and edits to evaluate, train and improve Ito's features and AI models
                </div>
              </div>
              <div
                className={`border rounded-lg p-4 cursor-pointer transition-all ${selected === 'privacy' ? 'border-purple-200 bg-purple-50 border-2' : 'border-border border-2 bg-background'}`}
                onClick={() => setSelected('privacy')}
              >
                <div className="flex items-center justify-between w-full my-2">
                  <div className="font-medium">Privacy Mode</div>
                  {selected === 'privacy' && (
                    <div><Lock style={{ color: '#a78bfa', width: 18, height: 18 }} /></div>
                  )}
                </div>
                <div className="text-muted-foreground max-w-md mt-1">
                  If you enable Privacy Mode, none of your dictation data will be stored or used for model training by us or any third party.
                </div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground mb-8">
              You can always change this later in settings. <a href="#" className="underline">Read more here.</a>
            </div>
            <Button className="w-24 mb-8 mt-6" disabled={!selected} onClick={() => { if (selected && onContinue) onContinue(); }}>Continue</Button>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-neutral-200 border-l border-border">
        <Lock style={{ width: 220, height: 220, color: '#D1D5DB' }} />
      </div>
    </div>
  )
} 