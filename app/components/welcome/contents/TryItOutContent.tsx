import { Button } from '@/app/components/ui/button'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { useSettingsStore } from '@/app/store/useSettingsStore'
import SlackIcon from '../../icons/SlackIcon'
import GmailIcon from '../../icons/GmailIcon'
import ChatGPTIcon from '../../icons/ChatGPTIcon'
import NotionIcon from '../../icons/NotionIcon'
import CursorIcon from '../../icons/CursorIcon'
import { useState } from 'react'
import { ArrowUp } from '@mynaui/icons-react'
import React from 'react'
import { ItoMode } from '@/app/generated/ito_pb'
import { getKeyDisplay } from '@/app/utils/keyboard'
import { usePlatform } from '@/app/hooks/usePlatform'
import { KeyName } from '@/lib/types/keyboard'

export default function TryItOut() {
  const { decrementOnboardingStep, setOnboardingCompleted } =
    useOnboardingStore()
  const { getItoModeShortcuts } = useSettingsStore()
  const keyboardShortcut = getItoModeShortcuts(ItoMode.TRANSCRIBE)[0].keys
  const platform = usePlatform()
  const [selectedApp, setSelectedApp] = useState<
    'slack' | 'gmail' | 'cursor' | 'chatgpt' | 'notion'
  >('slack')

  function renderDemo() {
    if (selectedApp === 'slack') {
      return (
        <div className="w-[475px] rounded-2xl bg-white shadow-lg flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2 bg-neutral-100 py-4 px-4 rounded-t-2xl">
            <div
              className="bg-white rounded-md p-1"
              style={{ width: 24, height: 24 }}
            >
              <SlackIcon />
            </div>
            <span className="text-base font-medium">Slack</span>
          </div>
          <div className="flex items-center gap-2 px-4 mt-24">
            <div className="w-10 h-10 rounded-md bg-yellow-200 flex items-center justify-center text-lg font-bold">
              B
            </div>
            <div>
              <div className="font-medium">Jordan</div>
              <div className="text-sm">Hey Taylor, is Ito working for you?</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 pb-4 rounded-b-2xl">
            <input
              type="text"
              placeholder={`Hold down on the hotkey(s) and start speaking...`}
              className="w-full h-12 border border-neutral-500 rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      )
    }
    if (selectedApp === 'gmail') {
      return (
        <div className="w-[475px] rounded-2xl bg-white shadow-lg flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2 py-4 px-4 rounded-t-2xl border-b border-neutral-200 bg-neutral-100">
            <div
              className="bg-white rounded-md p-1"
              style={{ width: 24, height: 24 }}
            >
              <GmailIcon />
            </div>
            <span className="text-base font-medium">Gmail</span>
          </div>
          <div className="flex flex-col gap-2 px-6 pb-6">
            <div className="text-sm text-muted-foreground">
              Subject:{' '}
              <span className="font-medium text-black">Quick update</span>
            </div>
            <div className="border-t border-neutral-200 my-2" />
            <textarea
              placeholder={`Try saying:\n\n"Hi Jordan, wonderful meeting with you today. Do you have any time Monday to follow up on the project? Thanks, Taylor"`}
              className="w-full resize-none bg-transparent border-none focus:outline-none focus:ring-0 text-sm placeholder:text-muted-foreground"
              rows={6}
            />
          </div>
        </div>
      )
    }
    if (selectedApp === 'notion') {
      return (
        <div
          className="w-[475px] rounded-2xl bg-white shadow-lg flex flex-col"
          style={{ minHeight: 280 }}
        >
          <div className="flex items-center gap-2 mb-2 py-4 px-4 rounded-t-2xl border-b border-neutral-200 bg-neutral-100">
            <div
              className="bg-white rounded-md p-1"
              style={{ width: 24, height: 24 }}
            >
              <NotionIcon />
            </div>
            <span className="text-base font-medium">Notion</span>
          </div>
          <div className="flex flex-col items-start w-full px-4 py-3">
            <span className="text-2xl font-bold">New Note</span>
            <textarea
              placeholder={`Try saying: "Project tasks: Jordan will draft the proposal, Taylor will review and finalize by Friday."`}
              className="w-full mt-4 resize-none bg-transparent border-none focus:outline-none focus:ring-0 text-sm placeholder:text-muted-foreground"
              rows={4}
            />
          </div>
        </div>
      )
    }
    if (selectedApp === 'chatgpt') {
      return (
        <div
          className="w-[475px] rounded-2xl bg-white shadow-lg flex flex-col"
          style={{ minHeight: 280 }}
        >
          <div className="flex items-center gap-2 mb-2 py-4 px-4 rounded-t-2xl border-b border-neutral-200 bg-neutral-100">
            <div
              className="bg-white rounded-md p-1"
              style={{ width: 24, height: 24 }}
            >
              <ChatGPTIcon />
            </div>
            <span className="text-base font-medium">ChatGPT</span>
          </div>
          <div className="flex-1 flex flex-col justify-end px-4 gap-2">
            <div className="flex-1 flex flex-col justify-end px-6 py-8 gap-2"></div>
            <div className="flex items-center mb-4 bg-neutral-100 rounded-2xl">
              <input
                type="text"
                placeholder="Ask AI to generate a React component"
                className="w-full px-4 py-3 bg-transparent border-none focus:outline-none focus:ring-0 text-sm placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </div>
      )
    }
    if (selectedApp === 'cursor') {
      return (
        <div
          className="w-[475px] rounded-2xl bg-[#23272e] shadow-lg flex flex-col justify-between"
          style={{ minHeight: 320 }}
        >
          <div className="flex flex-col gap-2 p-4 h-full justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 rounded-t-2xl">
                <div
                  className="bg-neutral-100 rounded-md p-1"
                  style={{ width: 24, height: 24 }}
                >
                  <CursorIcon />
                </div>
                <span className="text-base font-medium text-white">Cursor</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-[#23272e] border border-[#3a3f4b] text-xs text-white px-2 py-0.5 rounded font-mono flex items-center gap-1">
                  <span className="text-[#7dd3fc]">@</span> TryItOut.tsx
                </span>
              </div>
              <textarea
                placeholder="Plan, search, build anything"
                className="w-full bg-transparent border-none focus:outline-none focus:ring-0 resize-none text-base text-muted-foreground placeholder:text-muted-foreground mt-2"
                rows={3}
              />
            </div>
            <div className="flex justify-between gap-2 mt-2">
              <div className="flex items-center gap-2">
                <span className="bg-[#23272e] border border-[#3a3f4b] text-xs text-white px-2 py-0.5 rounded flex items-center gap-1">
                  <span className="text-[#a78bfa]">∞</span> Agent{' '}
                  <span className="text-[#a3a3a3]">⌘I</span>
                </span>
                <span className="bg-[#23272e] border border-[#3a3f4b] text-xs text-white px-2 py-0.5 rounded ml-2">
                  Auto <span className="text-[#a3a3a3]">▾</span>
                </span>
              </div>
              <div className="flex">
                <span className="text-[#23272e] p-1 text-lg cursor-pointer rounded-full bg-[#a3a3a3]">
                  <ArrowUp size={16} />
                </span>
              </div>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  const apps = [
    { key: 'cursor', icon: <CursorIcon /> },
    { key: 'slack', icon: <SlackIcon /> },
    { key: 'gmail', icon: <GmailIcon /> },
    { key: 'chatgpt', icon: <ChatGPTIcon /> },
    { key: 'notion', icon: <NotionIcon /> },
  ]

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start px-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12">
          <div className="mt-8">
            <button
              className="mb-4 text-sm text-muted-foreground hover:underline"
              type="button"
              onClick={decrementOnboardingStep}
            >
              &lt; Back
            </button>
            <h1 className="text-3xl mb-4 mt-12">
              Use Ito with the keyboard shortcut.
            </h1>
            <p className="text-base text-muted-foreground mt-6">
              Hold down on the{' '}
              {keyboardShortcut.map((key, idx) => (
                <React.Fragment key={`keyboard-shortcut-${idx}`}>
                  <span className="inline-flex items-center px-2 py-0.5 bg-neutral-100 border rounded text-xs font-mono mx-1">
                    {getKeyDisplay(key, platform, {
                      showDirectionalText: false,
                      format: 'label',
                    })}
                  </span>
                  {idx < keyboardShortcut.length - 1 && (
                    <span className="text-muted-foreground"> + </span>
                  )}
                </React.Fragment>
              ))}{' '}
              key{keyboardShortcut.length > 1 ? 's' : ''}, speak, and let go to
              insert spoken text.
            </p>
          </div>
          <div className="flex flex-col items-start mb-8">
            <Button className="w-24" onClick={setOnboardingCompleted}>
              Finish
            </Button>
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
            <div className="text-sm text-muted-foreground mt-2 text-center">
              Or select any of the apps above
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
