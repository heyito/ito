import { Button } from '@/app/components/ui/button'
import { InfoCircle } from "@mynaui/icons-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { useState, useEffect, useRef } from 'react';
import { Spinner } from '@/app/components/ui/spinner';
import { Check, Lock } from "@mynaui/icons-react";

export default function SetupItoContent({ onBack }: { onBack?: () => void; }) {
  const [isAccessibilityEnabled, setIsAccessibilityEnabled] = useState(false)
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false)
  const [checkingAccessibility, setCheckingAccessibility] = useState(false)
  const [checkingMicrophone, setCheckingMicrophone] = useState(false)
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const microphonePollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      if (microphonePollingRef.current) {
        clearInterval(microphonePollingRef.current);
      }
    };
  }, []);

  useEffect(() => {
    window.api.invoke('check-accessibility-permission', false).then((enabled: boolean) => {
      setIsAccessibilityEnabled(enabled);
    });

    window.api.invoke('check-microphone-permission', false).then((enabled: boolean) => {
      setIsMicrophoneEnabled(enabled);
    });
  }, []);

  const pollAccessibility = () => {
    pollingRef.current = setInterval(() => {
      window.api.invoke('check-accessibility-permission', false).then((enabled: boolean) => {
        if (enabled) {
          setIsAccessibilityEnabled(true);
          setCheckingAccessibility(false);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      });
    }, 2000);
  };

  const pollMicrophone = () => {
    microphonePollingRef.current = setInterval(() => {
      window.api.invoke('check-microphone-permission', false).then((enabled: boolean) => {
        if (enabled) {
          setIsMicrophoneEnabled(true);
          setCheckingMicrophone(false);
          if (microphonePollingRef.current) {
            clearInterval(microphonePollingRef.current);
            microphonePollingRef.current = null;
          }
        }
      });
    }, 2000);
  };

  const handleAllowAccessibility = () => {
    setCheckingAccessibility(true);
    window.api.invoke('check-accessibility-permission', true).then((enabled: boolean) => {
      setIsAccessibilityEnabled(enabled);
      if (!enabled) {
        pollAccessibility();
      } else {
        setCheckingAccessibility(false);
      }
    });
  };

  const handleAllowMicrophone = () => {
    setCheckingMicrophone(true);
    window.api.invoke('check-microphone-permission', true).then((enabled: boolean) => {
      setIsMicrophoneEnabled(enabled);
      if (!enabled) {
        pollMicrophone();
      } else {
        setCheckingMicrophone(false);
      }
    });
  };

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start pl-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12">
          <div className="mt-8">
            <button className="mb-4 text-sm text-muted-foreground hover:underline" type="button" onClick={onBack}>&lt; Back</button>
            <h1 className="text-3xl mb-4 mt-12 pr-24">
              {isAccessibilityEnabled && isMicrophoneEnabled ? 'Thank you for trusting us. We take your privacy seriously.' : 'Set up Ito on your computer'}
            </h1>
            <div className="flex flex-col gap-4 my-8 pr-24">
              <div className="border rounded-lg p-4 flex flex-col gap-2 bg-background border-border border-2">
                <div className="flex items-center mb-2 gap-2">
                  {isAccessibilityEnabled && (
                    <div><Check className="mr-1" style={{ color: '#22c55e', width: 24, height: 24 }} /></div>
                  )}
                  <div className="font-medium text-base flex">
                    {isAccessibilityEnabled ? 'Ito can insert and edit text' : 'Allow Ito to insert spoken words'}
                  </div>
                </div>
                {!isAccessibilityEnabled && (
                  <>
                    <div className="text-sm text-muted-foreground mb-2">
                      This lets Ito put your spoken words in the right textbox and edit text according to your commands
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 mt-1">
                        <Button className="w-24" type="button" onClick={handleAllowAccessibility}>Allow</Button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center"><InfoCircle style={{ width: 20, height: 20 }} /></span>
                          </TooltipTrigger>
                          <TooltipContent side="right" align="start">
                            <p>Ito uses this to gather context based on the application you&apos;re using, <br /> and to access your clipboard temporarily to paste text.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      {checkingAccessibility && (
                        <div className="text-sm text-muted-foreground">
                          <Spinner size="medium" />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="border rounded-lg p-4 flex flex-col gap-2 bg-background border-border border-2">
                <div className="flex items-center mb-2 gap-2">
                  {isMicrophoneEnabled && (
                    <div><Check className="mr-1" style={{ color: '#22c55e', width: 24, height: 24 }} /></div>
                  )}
                  <div className="font-medium text-base flex">
                    {isMicrophoneEnabled ? 'Ito can use your microphone' : 'Allow Ito to use your microphone'}
                  </div>
                </div>
                {isAccessibilityEnabled && !isMicrophoneEnabled && (
                  <>
                    <div className="text-sm text-muted-foreground mb-2">
                      This lets Ito hear your voice and transcribe your speech
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 mt-1">
                        <Button className="w-24" type="button" onClick={handleAllowMicrophone}>Allow</Button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center"><InfoCircle style={{ width: 20, height: 20 }} /></span>
                          </TooltipTrigger>
                          <TooltipContent side="right" align="start">
                            <p>Ito will show an animation when the mic is active <br /> and only listen when you activate it</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      {checkingMicrophone && (
                        <div className="text-sm text-muted-foreground">
                          <Spinner size="medium" />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <Button className={`w-24 mb-8 ${isAccessibilityEnabled && isMicrophoneEnabled ? '' : 'hidden'}`} style={{marginTop: '130px'}} onClick={() => {}}>Continue</Button>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-neutral-200 border-l border-border">
        {/* Placeholder for screenshot/video */}
        <div className="w-[420px] h-[320px] rounded-lg flex items-center justify-center text-gray-500 text-lg">
          {isAccessibilityEnabled && isMicrophoneEnabled ? <Lock style={{ width: 220, height: 220, color: '#D1D5DB' }} /> : 'Video Placeholder'}
        </div>
      </div>
    </div>
  )
} 