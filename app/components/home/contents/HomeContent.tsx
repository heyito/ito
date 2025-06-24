import React from 'react'
import { InfoCircle } from '@mynaui/icons-react'
import { useSettingsStore } from '../../../store/useSettingsStore'
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip'

export default function HomeContent() {
  const { keyboardShortcut } = useSettingsStore()

  return (
    <div className="w-full px-36">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-medium">Welcome back, Evan</h1>
        </div>
        <div className="flex items-center text-sm text-gray-700">
          <span className="flex items-center gap-1 bg-slate-100 px-3 py-2 rounded-l-2xl relative after:content-[''] after:absolute after:right-0 after:top-[17.5%] after:h-[65%] after:w-[2px] after:bg-slate-200">
            🔥 1 week
          </span>
          <span className="flex items-center gap-1 bg-slate-100 px-3 py-2 relative after:content-[''] after:absolute after:right-0 after:top-[17.5%] after:h-[65%] after:w-[2px] after:bg-slate-200">
            🚀 7 words
          </span>
          <span className="flex items-center gap-1 bg-slate-100 px-3 py-2 rounded-r-2xl">
            👍 88 WPM
          </span>
        </div>
      </div>
      <div className="w-full h-[1px] bg-slate-200 my-10"></div>
      {/* Dictation Info Box */}
      <div className="bg-slate-100 rounded-xl p-6 flex items-center justify-between mb-10">
        <div>
          <div className="text-base font-medium mb-1">
            Voice dictation in any app
          </div>
          <div className="text-sm text-gray-600">
            <span key="hold-down">Hold down the trigger key </span>
            {keyboardShortcut.map((key, index) => (
              <React.Fragment key={index}>
                <span className="bg-slate-50 px-1 py-0.5 rounded text-xs font-mono shadow-sm">
                  {key}
                </span>
                <span>{index < keyboardShortcut.length - 1 && ' + '}</span>
              </React.Fragment>
            ))}
            <span key="and"> and speak into any textbox</span>
          </div>
        </div>
        <button className="bg-gray-900 text-white px-4 py-2 rounded-md font-semibold hover:bg-gray-800 cursor-pointer">
          Explore use cases
        </button>
      </div>
      {/* Recent Activity */}
      <div>
        <div className="text-sm text-muted-foreground mb-6">
          Recent activity
        </div>
        <div className="text-xs text-gray-500 mb-4">YESTERDAY</div>
        <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-200">
          <div className="flex items-center justify-start px-4 py-4 gap-10">
            <div className="text-gray-600">04:17 PM</div>
            <div className="text-gray-900">Create a React component</div>
          </div>
          <div className="flex items-center justify-start px-4 py-4 gap-10">
            <div className="text-gray-600">03:45 PM</div>
            <div className="text-gray-600 flex items-center gap-1">
              Audio is silent.{' '}
              <Tooltip>
                <TooltipTrigger>
                  <InfoCircle className="w-4 h-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  Ito didn't detect any words so the transcript is empty
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center justify-start px-4 py-4 gap-10">
            <div className="text-gray-600">03:45 PM</div>
            <div className="text-gray-600 flex items-center gap-1">
              Audio is silent.{' '}
              <Tooltip>
                <TooltipTrigger>
                  <InfoCircle className="w-4 h-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  Ito didn't detect any words so the transcript is empty
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center justify-start px-4 py-4 gap-10">
            <div className="text-gray-600">03:45 PM</div>
            <div className="text-gray-600 flex items-center gap-1">
              Audio is silent.{' '}
              <Tooltip>
                <TooltipTrigger>
                  <InfoCircle className="w-4 h-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  Ito didn't detect any words so the transcript is empty
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
