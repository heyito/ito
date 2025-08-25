import {
  LlmSettings,
  useAdvancedSettingsStore,
} from '@/app/store/useAdvancedSettingsStore'
import { ChangeEvent, useEffect, useRef, useState } from 'react'

type LlmSettingConfig = {
  name: keyof LlmSettings
  label: string
  placeholder: string
  description: string
  maxLength: number
  resize?: boolean
  readOnly?: boolean
  isSelect?: boolean
  options?: string[]
}

const modelProviderLengthLimit = 30
const floatLengthLimit = 4
const asrPromptLengthLimit = 100
const llmPromptLenghtLimit = 1500

const llmSettingsConfig: LlmSettingConfig[] = [
  {
    name: 'asrProvider',
    label: 'ASR Provider',
    placeholder: 'Enter ASR provider name',
    description: '',
    maxLength: modelProviderLengthLimit,
    readOnly: true,
  },
  {
    name: 'asrModel',
    label: 'ASR Model',
    placeholder: 'Enter ASR model name',
    description: 'The ASR model used for speech-to-text transcription',
    maxLength: modelProviderLengthLimit,
  },
  {
    name: 'asrPrompt',
    label: 'ASR Prompt',
    placeholder: 'Enter custom ASR prompt',
    description:
      'A custom prompt to guide the ASR transcription process for better accuracy. Dictionary will be appended. (Leave empty for default)',
    maxLength: asrPromptLengthLimit,
    resize: true,
  },
  {
    name: 'llmProvider',
    label: 'LLM Provider',
    placeholder: 'Select LLM provider',
    description: 'LLM provider for text generation tasks',
    maxLength: modelProviderLengthLimit,
    isSelect: true,
    options: ['groq', 'cerebras'],
  },
  {
    name: 'llmModel',
    label: 'LLM Model',
    placeholder: 'Enter LLM model name',
    description: 'The LLM model used for text generation tasks',
    maxLength: modelProviderLengthLimit,
  },
  {
    name: 'llmTemperature',
    label: 'LLM Temperature',
    placeholder: 'Enter LLM temperature (e.g., 0.7)',
    description:
      'Controls the randomness of the LLM output. Higher values produce more diverse results.',
    maxLength: floatLengthLimit,
  },
  {
    name: 'transcriptionPrompt',
    label: 'Transcription Prompt',
    placeholder: 'Enter custom transcription prompt',
    description:
      'A custom prompt to guide the transcription process for better accuracy. (Leave empty for default)',
    maxLength: llmPromptLenghtLimit,
    resize: true,
  },
  {
    name: 'editingPrompt',
    label: 'Editing Prompt',
    placeholder: 'Enter custom editing prompt',
    description:
      'A custom prompt to guide the editing process for improved text quality. (Leave empty for default)',
    maxLength: llmPromptLenghtLimit,
    resize: true,
  },
  {
    name: 'noSpeechThreshold',
    label: 'No Speech Threshold',
    placeholder: 'e.g., 0.6',
    description: 'Threshold for detecting no speech segments in audio.',
    maxLength: floatLengthLimit,
  },
  {
    name: 'lowQualityThreshold',
    label: 'Low Quality Threshold',
    placeholder: 'e.g., 0.3',
    description: 'Threshold for identifying low-quality audio segments.',
    maxLength: floatLengthLimit,
  },
]

function formatDisplayValue(value: string): string {
  // If its a number then format it to 2 decimal places
  if (!isNaN(Number(value)) && value !== '') {
    return Number(value).toFixed(2)
  }
  return value
}

interface SettingInputProps {
  config: LlmSettingConfig
  value: string
  onChange: (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    config: LlmSettingConfig,
  ) => void
}

function SettingInput({ config, value, onChange }: SettingInputProps) {
  const [localValue, setLocalValue] = useState(value)
  const [isFocused, setIsFocused] = useState(false)
  const [editingValue, setEditingValue] = useState('')

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value)
    }
  }, [value, isFocused])

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const newValue = e.target.value
    setEditingValue(newValue)
    setLocalValue(newValue)
    onChange(e, config)
  }

  const handleFocus = () => {
    setIsFocused(true)
    // Start with the formatted display value to avoid jarring transition
    const startValue = formatDisplayValue(value)
    setEditingValue(startValue)
    setLocalValue(startValue)
  }

  const handleBlur = () => {
    setIsFocused(false)
    setEditingValue('')
  }

  const displayValue = isFocused ? editingValue : formatDisplayValue(value)

  return (
    <div className="mb-5">
      <label
        htmlFor={config.name}
        className="block text-sm font-medium text-slate-700 mb-1"
      >
        {config.label}
      </label>
      {config.isSelect ? (
        <select
          id={config.name}
          value={value}
          onChange={handleChange}
          className="w-3/4 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={config.readOnly}
        >
          {config.options?.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={config.name}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="w-3/4 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder={config.placeholder}
          maxLength={config.maxLength}
          readOnly={config.readOnly}
        />
      )}
      <p className="text-xs text-slate-500 mt-1">{config.description}</p>
    </div>
  )
}

export default function AdvancedSettingsContent() {
  const { llm, setLlmSettings } = useAdvancedSettingsStore()
  const debounceRef = useRef<NodeJS.Timeout>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  function handleInputChange(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
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
              <SettingInput
                key={config.name}
                config={config}
                value={llm[config.name as string]}
                onChange={handleInputChange}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
