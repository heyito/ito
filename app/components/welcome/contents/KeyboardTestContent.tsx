import { Button } from '@/app/components/ui/button';
import { useOnboardingStore } from '@/app/store/useOnboardingStore';
import KeyboardKey from '../../ui/keyboard-key';

export default function KeyboardTestContent() {
  const { incrementOnboardingStep, decrementOnboardingStep, keyboardShortcut } = useOnboardingStore();

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start px-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12 overflow-hidden">
          <div className="mt-8">
            <button className="mb-4 text-sm text-muted-foreground hover:underline" type="button" onClick={decrementOnboardingStep}>&lt; Back</button>
            <h1 className="text-3xl mb-4 mt-12">Press the keyboard shortcut to test it out</h1>
            <div className="text-base text-muted-foreground mb-8 max-w-md">
              We recommend the <span className="inline-flex items-center px-2 py-0.5 bg-neutral-100 border rounded text-xs font-mono ml-1">fn</span> key at the bottom left of the keyboard
            </div>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-gradient-to-b from-purple-50/10 to-purple-100 border-l-2 border-purple-100">
        <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col items-center" style={{ minWidth: 500, maxHeight: 280 }}>
          <div className="text-lg font-medium mb-6 text-center">Does the button turn purple while pressing it?</div>
          <div className="flex justify-center items-center mb-6 w-full bg-neutral-50 py-4 rounded-lg gap-2" style={{ minHeight: 100 }}>
            {keyboardShortcut.map((keyboardKey, index) => (
              <KeyboardKey key={index} keyboardKey={keyboardKey} style={{ width: '80px', height: '80px' }} />
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="w-44" type="button">No, change shortcut</Button>
            <Button className="w-16" type="button" onClick={incrementOnboardingStep}>Yes</Button>
          </div>
        </div>
      </div>
    </div>
  );
} 