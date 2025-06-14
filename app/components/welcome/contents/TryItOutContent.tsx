import { Button } from '@/app/components/ui/button';
import { useOnboardingStore } from '@/app/store/useOnboardingStore';
import SlackIcon from '../icons/SlackIcon';
import GmailIcon from '../icons/GmailIcon';
import ChatGPTIcon from '../icons/ChatGPTIcon';
import NotionIcon from '../icons/NotionIcon';
import CursorIcon from '../icons/CursorIcon';
import { useState } from 'react';

export default function TryItOutContent() {
  const { incrementOnboardingStep, decrementOnboardingStep } = useOnboardingStore();
  const [selectedApp, setSelectedApp] = useState<'slack' | 'gmail' | 'cursor' | 'chatgpt' | 'notion'>('slack');

  function renderDemo() {
    if (selectedApp === 'slack') {
      return (
        <div className="w-[475px] rounded-2xl bg-white shadow-lg flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2 bg-neutral-100 py-4 px-4 rounded-t-2xl">
            <div className="bg-white rounded-md p-1" style={{ width: 24, height: 24 }}><SlackIcon /></div>
            <span className="text-base font-medium">Slack</span>
          </div>
          <div className="flex items-center gap-2 px-4 mt-24">
            <div className="w-10 h-10 rounded-md bg-yellow-200 flex items-center justify-center text-lg font-bold">B</div>
            <div>
              <div className="font-medium">Barron</div>
              <div className="text-sm">Hey Evan, is Ito working for you?</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 pb-4 rounded-b-2xl">
            <div className="relative w-full h-12 border border-neutral-500 rounded-md px-3 py-2 text-sm text-muted-foreground">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center text-sm text-muted-foreground select-none pointer-events-none"
                style={{ height: '100%' }}
              >
                <span className="ml-1 w-[1px] h-5 bg-muted-foreground animate-blink rounded-sm" style={{ display: 'inline-block' }} />
                Hold down on the fn key and start speaking...
              </span>
            </div>
          </div>
        </div>
      );
    }
    if (selectedApp === 'gmail') {
      return (
        <div className="w-[475px] rounded-2xl bg-white shadow-lg flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2 py-4 px-4 rounded-t-2xl border-b border-neutral-200 bg-neutral-100">
            <div className="bg-white rounded-md p-1" style={{ width: 24, height: 24 }}><GmailIcon /></div>
            <span className="text-base font-medium">Gmail</span>
          </div>
          <div className="flex flex-col gap-2 px-6 pb-20">
            <div className="text-sm text-muted-foreground">Subject: <span className="font-medium text-black">Quick update</span></div>
            <div className="border-t border-neutral-200 my-2" />
            <div className="text-sm text-muted-foreground">
              <span className="align-middle inline-block w-[1px] h-5 bg-muted-foreground animate-blink rounded-sm" />
              Try saying:
              <br />
              <br />
              "Hi Barron, I am rescheduling our meeting to tomorrow at 9am. Had to deal with an angry customer today. Thanks, Evan"
            </div>
          </div>
        </div>
      );
    }
    // Optionally, add placeholder demos for other apps if needed
    return null;
  }

  const apps = [
    { key: 'cursor', icon: <CursorIcon /> },
    { key: 'slack', icon: <SlackIcon /> },
    { key: 'gmail', icon: <GmailIcon /> },
    { key: 'chatgpt', icon: <ChatGPTIcon /> },
    { key: 'notion', icon: <NotionIcon /> },
  ];

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start px-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12">
          <div className="mt-8">
            <button className="mb-4 text-sm text-muted-foreground hover:underline" type="button" onClick={decrementOnboardingStep}>&lt; Back</button>
            <h1 className="text-3xl mb-4 mt-12">Use Ito with the keyboard shortcut</h1>
            <p className="text-base text-muted-foreground mt-6">
              Hold down on the <span className="inline-flex items-center px-2 py-0.5 bg-neutral-100 border rounded text-xs font-mono ml-1">fn</span> key, speak, and let go to insert spoken text.
            </p>
          </div>
          <div className="flex flex-col items-start mb-8">
            <Button className="w-24" onClick={incrementOnboardingStep}>Finish</Button>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-gradient-to-b from-purple-50/10 to-purple-100 border-l-2 border-purple-100">
        <div className="flex flex-col items-center h-full justify-between pt-36 pb-24">
          {renderDemo()}
          <div className="flex flex-col">
            <div className="flex flex-row gap-2 px-4 pt-3 pb-5 rounded-2xl bg-gray-300/70">
              {apps.map(app => (
                <div
                  key={app.key}
                  className="relative bg-white p-2 rounded-md shadow-md cursor-pointer flex items-center justify-center"
                  style={{ width: 48, height: 48 }}
                  onClick={() => setSelectedApp(app.key as typeof selectedApp)}
                >
                  {app.icon}
                  {selectedApp === app.key && (
                    <span className="absolute left-1/2 -translate-x-1/2 -bottom-3 w-2 h-2 rounded-full bg-white shadow" />
                  )}
                </div>
              ))}
            </div>
            <div className="text-sm text-muted-foreground mt-2 text-center">Or select any of the apps above</div>
          </div>
        </div>
      </div>
    </div>
  );
} 