import { Grid, BookOpen, FileText } from '@mynaui/icons-react';
import { ItoIcon } from '../icons/ItoIcon';

export default function HomeKit() {
  return (
    <div className="flex h-full bg-slate-50">
      {/* Sidebar */}
      <div className="w-64 flex flex-col justify-between py-2 px-4">
        <div>
          {/* Logo and Plan */}
          <div className="flex items-center mb-10 px-3">
            <ItoIcon className="w-6 h-6 text-gray-900" />
            <span className="text-2xl font-bold ml-2">Ito</span>
          </div>
          {/* Nav */}
          <div className="flex flex-col gap-1 text-sm">
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded bg-slate-200 font-medium">
              <Grid className="w-5 h-5" /> Home
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-200">
              <BookOpen className="w-5 h-5" /> Dictionary
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-200">
              <FileText className="w-5 h-5" /> Notes
            </a>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col w-full items-center bg-white rounded-lg m-2 mt-0 border border-neutral-200 pt-8">
        <div className="w-full px-36">
          <div className="flex items-center justify-between my-8">
            <div>
              <h1 className="text-2xl font-bold">Welcome back, Evan</h1>
            </div>
            <div className="flex items-center text-sm text-gray-700">
              <span className="flex items-center gap-1 bg-slate-100 px-3 py-2 rounded-l-2xl relative after:content-[''] after:absolute after:right-0 after:top-[17.5%] after:h-[65%] after:w-[2px] after:bg-slate-200">🔥 1 week</span>
              <span className="flex items-center gap-1 bg-slate-100 px-3 py-2 relative after:content-[''] after:absolute after:right-0 after:top-[17.5%] after:h-[65%] after:w-[2px] after:bg-slate-200">🚀 7 words</span>
              <span className="flex items-center gap-1 bg-slate-100 px-3 py-2 rounded-r-2xl">👍 88 WPM</span>
            </div>
          </div>
          <div className="w-full h-[1px] bg-slate-200 my-10"></div>
          {/* Dictation Info Box */}
          <div className="bg-slate-100 rounded-xl p-6 flex items-center justify-between mb-10">
            <div>
              <div className="text-base font-medium mb-1">Voice dictation in any app</div>
              <div className="text-sm text-gray-600">Hold down the trigger key <span className="bg-slate-50 px-1 py-0.5 rounded text-xs font-mono shadow-sm">fn</span> and speak into any textbox</div>
            </div>
            <button className="bg-gray-900 text-white px-4 py-2 rounded font-semibold hover:bg-gray-800">Explore use cases</button>
          </div>
          {/* Recent Activity */}
          <div>
            <div className="text-sm text-muted-foreground mb-6">Recent activity</div>
            <div className="text-xs text-gray-500 mb-4">YESTERDAY</div>
            <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-200">
              <div className="flex items-center justify-start px-4 py-4 gap-10">
                <div className="text-gray-600">04:17 PM</div>
                <div className="text-gray-900">Create a React component</div>
              </div>
              <div className="flex items-center justify-start px-4 py-4 gap-10">
                <div className="text-gray-600">03:45 PM</div>
                <div className="text-gray-600 flex items-center gap-1">Audio is silent. <span className="text-gray-400" title="No audio detected">&#9432;</span></div>
              </div>
              <div className="flex items-center justify-start px-4 py-4 gap-10">
                <div className="text-gray-600">03:45 PM</div>
                <div className="text-gray-600 flex items-center gap-1">Audio is silent. <span className="text-gray-400" title="No audio detected">&#9432;</span></div>
              </div>
              <div className="flex items-center justify-start px-4 py-4 gap-10">
                <div className="text-gray-600">03:45 PM</div>
                <div className="text-gray-600 flex items-center gap-1">Audio is silent. <span className="text-gray-400" title="No audio detected">&#9432;</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
