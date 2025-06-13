import { Button } from '@/app/components/ui/button';
import { useEffect, useState } from 'react';
import { useOnboardingStore } from '@/app/store/useOnboardingStore';
import { setupVolumeMonitoring } from '@/lib/media/microphone';

function MicrophoneBars({ volume }: { volume: number }) {
  // Each bar is either full height or min height depending on threshold
  const minHeight = 0.2;
  const levels = Array(12).fill(0).map((_, i) => {
    const threshold = (i / 12) * 0.5;
    const normalizedVolume = Math.min(volume * 1.35, 1);
    return normalizedVolume > threshold ? 1 : minHeight;
  });

  return (
    <div className="flex gap-1 py-4 px-4 items-end bg-neutral-200 rounded-md" style={{ minHeight: 120 }}>
      {levels.map((level, i) => (
        <div
          key={i}
          className={`mx-2 h-full ${level > minHeight ? 'bg-purple-300' : 'bg-neutral-300'}`}
          style={{
            width: 18,
            borderRadius: 6,
            transition: 'height 0.18s cubic-bezier(.4,2,.6,1)',
          }}
        />
      ))}
    </div>
  );
}

export default function MicrophoneTestContent() {
  const { incrementOnboardingStep, decrementOnboardingStep } = useOnboardingStore();
  const [isMicTested, setIsMicTested] = useState(false);
  const [volume, setVolume] = useState(0);
  const [smoothedVolume, setSmoothedVolume] = useState(0);

  useEffect(() => {
    setupVolumeMonitoring((volume) => setVolume(volume))
  }, [])

  // Smooth the volume updates to reduce flicker
  useEffect(() => {
    const smoothing = 0.2; // Lower = smoother, higher = more responsive
    setSmoothedVolume(prev => prev * (1 - smoothing) + volume * smoothing);
  }, [volume]);

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start px-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12 overflow-hidden">
          <div className="mt-8">
            <button className="mb-4 text-sm text-muted-foreground hover:underline" type="button" onClick={decrementOnboardingStep}>&lt; Back</button>
            <h1 className="text-3xl mb-4 mt-12">Speak to test your microphone</h1>
            <div className="text-base text-muted-foreground mb-8 max-w-md">Your computer's built-in mic will ensure optimal transcription</div>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-neutral-200 border-l border-border">
        <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col items-center" style={{ minWidth: 500, maxHeight: 280 }}>
          <div className="text-lg font-medium mb-6 text-center">Do you see purple bars moving while you speak?</div>
          <MicrophoneBars volume={smoothedVolume} />
          <div className="flex gap-4 mt-6">
            <Button variant="outline" className="w-44" type="button">No, change microphone</Button>
            <Button className="w-16" type="button" onClick={incrementOnboardingStep}>Yes</Button>
          </div>
        </div>
      </div>
    </div>
  );
} 