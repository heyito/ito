import { useAdvancedSettingsStore } from '@/app/store/useAdvancedSettingsStore'

export default function AdvancedSettingsContent() {
  const { llm, setLlmSettings } = useAdvancedSettingsStore()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          Advanced Settings
        </h3>
        <p className="text-slate-600">
          Configure advanced options and experimental features.
        </p>
      </div>

      {/* LLM Settings Section */}
      <div className="space-y-4">
        <div>
          <h4 className="text-md font-medium text-slate-900 mb-3">
            LLM Settings
          </h4>
          <div className="space-y-3">
            <div>
              <label
                htmlFor="asr-model"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                ASR Model
              </label>
              <input
                id="asr-model"
                type="text"
                value={llm.asrModel}
                onChange={e => setLlmSettings({ asrModel: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter ASR model name"
              />
              <p className="text-xs text-slate-500 mt-1">
                The Groq model used for speech-to-text transcription
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
