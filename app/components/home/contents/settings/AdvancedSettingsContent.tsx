import {
  LlmSettings,
  useAdvancedSettingsStore,
} from '@/app/store/useAdvancedSettingsStore'
import { ChangeEvent, useEffect, useRef } from 'react'

type LlmSettingConfig = {
  name: keyof LlmSettings
  label: string
  placeholder: string
  description: string
  maxLength: number
  resize?: boolean
  readOnly?: boolean
}

const llmSettingsConfig: LlmSettingConfig[] = [
  {
    name: 'asrProvider',
    label: 'ASR Provider',
    placeholder: 'Enter ASR provider name',
    description: '',
    maxLength: 0,
    readOnly: true,
  },
  {
    name: 'asrModel',
    label: 'ASR Model',
    placeholder: 'Enter ASR model name',
    description: 'The Groq model used for speech-to-text transcription',
    maxLength: 30,
  },
  {
    name: 'asrPrompt',
    label: 'ASR Prompt',
    placeholder: 'Enter custom ASR prompt',
    description:
      'A custom prompt to guide the ASR transcription process for better accuracy. Dictionary will be appended. (Leave empty for default)',
    maxLength: 100,
    resize: true,
  },
  {
    name: 'llmProvider',
    label: 'LLM Provider',
    placeholder: 'Enter LLM provider name',
    description: 'LLM provider (currently only Groq is supported)',
    maxLength: 20,
    readOnly: true,
  },
  {
    name: 'llmModel',
    label: 'LLM Model',
    placeholder: 'Enter LLM model name',
    description: 'The Groq model used for text generation tasks',
    maxLength: 30,
  },
  {
    name: 'llmTemperature',
    label: 'LLM Temperature',
    placeholder: 'Enter LLM temperature (e.g., 0.7)',
    description:
      'Controls the randomness of the LLM output. Higher values produce more diverse results.',
    maxLength: 5,
  },
  {
    name: 'transcriptionPrompt',
    label: 'Transcription Prompt',
    placeholder: 'Enter custom transcription prompt',
    description:
      'A custom prompt to guide the transcription process for better accuracy. (Leave empty for default)',
    maxLength: 500,
    resize: true,
  },
  {
    name: 'editingPrompt',
    label: 'Editing Prompt',
    placeholder: 'Enter custom editing prompt',
    description:
      'A custom prompt to guide the editing process for improved text quality. (Leave empty for default)',
    maxLength: 500,
    resize: true,
  },
  {
    name: 'noSpeechThreshold',
    label: 'No Speech Threshold',
    placeholder: 'e.g., 0.6',
    description: 'Threshold for detecting no speech segments in audio.',
    maxLength: 5,
  },
  {
    name: 'lowQualityThreshold',
    label: 'Low Quality Threshold',
    placeholder: 'e.g., 0.3',
    description: 'Threshold for identifying low-quality audio segments.',
    maxLength: 5,
  },
]

export default function AdvancedSettingsContent() {
  const { llm, setLlmSettings } = useAdvancedSettingsStore()
  const debounceRef = useRef<NodeJS.Timeout>(null)

  console.log({ llm })

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  function handleInputChange(
    e: ChangeEvent<HTMLInputElement>,
    config: LlmSettingConfig,
  ) {
    const newValue = e.target.value
    setLlmSettings({ [config.name]: newValue })

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      await window.api.updateAdvancedSettings({
        llm: { ...llm, [config.name]: newValue },
      })
    }, 1000)
  }

  return (
    <div className="max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-500 scrollbar-track-transparent">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Advanced Settings
        </h2>
        <p className="text-slate-600 mb-3">
          Configure advanced options and experimental features.
        </p>
      </div>

      {/* LLM Settings Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-md font-medium text-slate-900 mb-3">
            LLM Settings
          </h3>
          <div className="space-y-3">
            {llmSettingsConfig.map(config => (
              <div key={config.name} className="mb-5">
                <label
                  htmlFor={config.name}
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  {config.label}
                </label>
                <input
                  id={config.name}
                  // type="text"
                  value={llm[config.name as string]}
                  onChange={e => handleInputChange(e, config)}
                  className={
                    'w-3/4 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                  }
                  placeholder={config.placeholder}
                  maxLength={config.maxLength}
                  readOnly={config.readOnly}
                />
                <p className="text-xs text-slate-500 mt-1">
                  {config.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
