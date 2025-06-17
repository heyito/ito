export default function DictionaryContent() {
  return (
    <div className="w-full px-36">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-medium">Dictionary</h1>
        <button className="bg-gray-900 text-white px-4 py-2 rounded font-semibold hover:bg-gray-800 cursor-pointer">
          Add new
        </button>
      </div>

      <div className="w-full h-[1px] bg-slate-200 my-10"></div>
      
      <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-200 max-h-131 overflow-y-auto"
        style={{
          msOverflowStyle: 'none',
          scrollbarWidth: 'none'
        }}>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">Mike McGraw</div>
        </div>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">mike@demoxlabs.xyz</div>
        </div>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">John Stephens</div>
        </div>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">john@demoxlabs.xyz</div>
        </div>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">Julian Gomez</div>
        </div>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">julian@demoxlabs.xyz</div>
        </div>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">Arjun Padmajan</div>
        </div>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">arjun@demoxlabs.xyz</div>
        </div>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">Barron Caster</div>
        </div>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">barron@demoxlabs.xyz</div>
        </div>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">Evan Marshall</div>
        </div>
        <div className="flex items-center justify-start px-4 py-4 gap-10">
          <div className="text-gray-900">evan@demoxlabs.xyz</div>
        </div>
      </div>
    </div>
  )
} 