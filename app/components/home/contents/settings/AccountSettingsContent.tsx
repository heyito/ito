export default function AccountSettingsContent() {
  return (
    <div className="h-full justify-between">
      <div className="space-y-6">
        {/* First name */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-900">First name</label>
          <input 
            type="text" 
            value="Evan" 
            className="w-80 bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Last name */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-900">Last name</label>
          <input 
            type="text" 
            value="Marshall" 
            className="w-80 bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Email */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-900">Email</label>
          <div className="w-80 text-sm text-gray-600 px-4">
            evan@demoxlabs.xyz
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex pt-8 justify-between w-full">
        <button className="px-6 py-3 bg-neutral-200 text-neutral-700 rounded-lg font-medium hover:bg-neutral-300 transition-colors cursor-pointer">
          Sign out
        </button>
        <button className="px-6 py-3 text-neutral-900 font-medium hover:text-neutral-700 transition-colors cursor-pointer">
          Delete account
        </button>
      </div>
    </div>
  )
} 