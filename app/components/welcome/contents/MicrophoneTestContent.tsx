import { Button } from '@/app/components/ui/button';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useOnboardingStore } from '@/app/store/useOnboardingStore';
import { setupVolumeMonitoring, getAvailableMicrophones, microphoneToRender, Microphone } from '@/lib/media/microphone';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/app/components/ui/dialog";

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
  const {
    incrementOnboardingStep,
    decrementOnboardingStep,
    microphoneDeviceId,
    setMicrophoneDeviceId,
  } = useOnboardingStore()
  const [volume, setVolume] = useState(0)
  const [smoothedVolume, setSmoothedVolume] = useState(0)
  const [availableMicrophones, setAvailableMicrophones] = useState<Array<Microphone>>([])
  const [tempSelectedMicrophone, setTempSelectedMicrophone] = useState<string>('default');
  const cleanupRef = useRef<(() => void) | null>(null);

  const initializeMicrophone = useCallback(async (deviceId: string) => {
    try {
      // Clean up previous microphone if it exists
      if (cleanupRef.current) {
        cleanupRef.current();
      }
      
      // Setup new microphone
      const newCleanup = await setupVolumeMonitoring((volume) => setVolume(volume), deviceId);
      cleanupRef.current = newCleanup;
    } catch (error) {
      console.error('Failed to initialize microphone:', error);
    }
  }, []);

  // Single effect to handle both initial load and device selection
  useEffect(() => {
    let mounted = true;

    const loadAndInitialize = async () => {
      try {
        const mics = await getAvailableMicrophones();
        
        // Only proceed if component is still mounted
        if (!mounted) {
          return;
        }
        
        setAvailableMicrophones(mics);
        
        if (mics.length > 0) {
          const initialDeviceId = mics[0].deviceId;
          setMicrophoneDeviceId(initialDeviceId);
          setTempSelectedMicrophone(initialDeviceId);
          await initializeMicrophone(initialDeviceId);
        }
      } catch (error) {
        console.error('Failed to load microphones:', error);
      }
    };

    loadAndInitialize();

    // Cleanup on unmount
    return () => {
      mounted = false;
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Smooth the volume updates to reduce flicker
  useEffect(() => {
    const smoothing = 0.2; // Lower = smoother, higher = more responsive
    setSmoothedVolume(prev => prev * (1 - smoothing) + volume * smoothing);
  }, [volume]);

  const handleMicrophoneSelect = (deviceId: string) => {
    setTempSelectedMicrophone(deviceId);
  };

  const handleDialogClose = async () => {
    if (tempSelectedMicrophone !== microphoneDeviceId) {
      setMicrophoneDeviceId(tempSelectedMicrophone)
      console.log('Changing microphone to deviceId:', tempSelectedMicrophone)
      await initializeMicrophone(tempSelectedMicrophone)
    }
  }

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start px-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12 overflow-hidden">
          <div className="mt-8">
            <button className="mb-4 text-sm text-muted-foreground hover:underline" type="button" onClick={decrementOnboardingStep}>&lt; Back</button>
            <h1 className="text-3xl mb-4 mt-12">Speak to test your microphone</h1>
            <div className="text-base text-muted-foreground mb-8 max-w-md">Your computer's built-in mic will ensure accurate transcription with minimal latency</div>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-neutral-200 border-l border-border">
        <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col items-center" style={{ minWidth: 500, maxHeight: 280 }}>
          <div className="text-lg font-medium mb-6 text-center">Do you see purple bars moving while you speak?</div>
          <MicrophoneBars volume={smoothedVolume} />
          <div className="flex gap-2 mt-6">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-44" type="button">No, change microphone</Button>
              </DialogTrigger>
              <DialogContent className="!border-0 shadow-lg p-8" showCloseButton={false}>
                <DialogTitle className="sr-only">Select Microphone</DialogTitle>
                <DialogDescription className="sr-only">Choose a microphone from the list below to use for voice input</DialogDescription>
                {availableMicrophones.map((mic) => {
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
                      <div className="font-medium text-base truncate" style={{ maxWidth: '100%' }}>{title}</div>
                      {description && <div className="text-sm text-muted-foreground truncate mt-2" style={{ maxWidth: '100%' }}>{description}</div>}
                    </div>
                  )
                })}
                <div className="flex justify-end mt-6">
                  <DialogClose asChild>
                    <Button className="w-32" type="button" onClick={handleDialogClose}>Save and close</Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
            <Button className="w-16" type="button" onClick={incrementOnboardingStep}>Yes</Button>
          </div>
        </div>
      </div>
    </div>
  );
} 