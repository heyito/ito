import {
  LlmSettings,
  useAdvancedSettingsStore,
} from '@/app/store/useAdvancedSettingsStore'
import {
  ChangeEvent,
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
} from 'react'
import { useWindowContext } from '@/app/components/window/WindowContext'

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
const llmPromptLengthLimit = 1500

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
    maxLength: llmPromptLengthLimit,
    resize: true,
  },
  // This is being removed until long term solution for versioning prompts is implemented
  // https://github.com/heyito/ito/issues/174
  // {
  //   name: 'editingPrompt',
  //   label: 'Editing Prompt',
  //   placeholder: 'Enter custom editing prompt',
  //   description:
  //     'A custom prompt to guide the editing process for improved text quality. (Leave empty for default)',
  //   maxLength: llmPromptLengthLimit,
  //   resize: true,
  // },
  {
    name: 'noSpeechThreshold',
    label: 'No Speech Threshold',
    placeholder: 'e.g., 0.6',
    description: 'Threshold for detecting no speech segments in audio.',
    maxLength: floatLengthLimit,
  },
]

function formatDisplayValue(value: string | number | null): string {
  if (value === null) {
    return ''
  }
  // If its a number then format it to 2 decimal places
  if (typeof value === 'number') {
    return value.toFixed(2)
  }
  return value
}

interface SettingInputProps {
  config: LlmSettingConfig
  value: string | number | null
  onChange: (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    config: LlmSettingConfig,
  ) => void
}

const SettingInput = memo(function SettingInput({
  config,
  value,
  onChange,
}: SettingInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [editingValue, setEditingValue] = useState('')

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const newValue = e.target.value
      setEditingValue(newValue)
      onChange(e, config)
    },
    [onChange, config],
  )

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    // Start with the formatted display value to avoid jarring transition
    const startValue = formatDisplayValue(value)
    setEditingValue(startValue)
  }, [value])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
    setEditingValue('')
  }, [])

  const displayValue = isFocused ? editingValue : formatDisplayValue(value)

  return (
    <div className="mb-5">
      <label
        htmlFor={config.name}
        className="block text-sm font-medium text-slate-700 mb-1 ml-1"
      >
        {config.label}
      </label>
      {config.isSelect ? (
        <select
          id={config.name}
          value={value ?? ''}
          onChange={handleChange}
          className="w-3/4 ml-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          className="w-3/4 ml-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder={config.placeholder}
          maxLength={config.maxLength}
          readOnly={config.readOnly}
        />
      )}
      <p className="w-3/4 text-xs text-slate-500 mt-1 ml-1">
        {config.description}
      </p>
    </div>
  )
})

export default function AdvancedSettingsContent() {
  const {
    llm,
    defaults,
    grammarServiceEnabled,
    macosAccessibilityContextEnabled,
    setLlmSettings,
    setGrammarServiceEnabled,
    setMacosAccessibilityContextEnabled,
  } = useAdvancedSettingsStore()
  const windowContext = useWindowContext()
  const debounceRef = useRef<NodeJS.Timeout>(null)

  // Helper to resolve null to actual default value for display
  const getDisplayValue = useCallback(
    (key: keyof LlmSettings): string | number | null => {
      const value = llm[key]
      if (value === null && defaults) {
        return defaults[key] ?? null
      }
      return value
    },
    [llm, defaults],
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const scheduleAdvancedSettingsUpdate = useCallback(
    (
      nextLlm: LlmSettings,
      nextGrammarEnabled: boolean,
      nextMacosAccessibilityEnabled: boolean,
    ) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(async () => {
        const settingsToSave = {
          llm: nextLlm,
          grammarServiceEnabled: nextGrammarEnabled,
          macosAccessibilityContextEnabled: nextMacosAccessibilityEnabled,
        }
        console.log('[AdvancedSettings] Saving settings...')
        await window.api.updateAdvancedSettings(settingsToSave)
      }, 1000)
    },
    [],
  )

  const handleInputChange = useCallback(
    (
      e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
      config: LlmSettingConfig,
    ) => {
      const rawValue = e.target.value

      // Determine if this field should be a number
      const isNumericField =
        config.name === 'llmTemperature' || config.name === 'noSpeechThreshold'

      // Parse the value appropriately
      let newValue: string | number | null
      if (rawValue === '') {
        newValue = null
      } else if (isNumericField) {
        const parsed = parseFloat(rawValue)
        newValue = isNaN(parsed) ? null : parsed
      } else {
        newValue = rawValue
      }

      const updatedLlm = { ...llm, [config.name]: newValue }
      setLlmSettings({ [config.name]: newValue })
      scheduleAdvancedSettingsUpdate(
        updatedLlm,
        grammarServiceEnabled,
        macosAccessibilityContextEnabled,
      )
    },
    [
      llm,
      grammarServiceEnabled,
      macosAccessibilityContextEnabled,
      setLlmSettings,
      scheduleAdvancedSettingsUpdate,
    ],
  )

  const handleGrammarServiceToggle = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const enabled = e.target.checked
      setGrammarServiceEnabled(enabled)
      scheduleAdvancedSettingsUpdate(
        llm,
        enabled,
        macosAccessibilityContextEnabled,
      )
    },
    [
      llm,
      macosAccessibilityContextEnabled,
      setGrammarServiceEnabled,
      scheduleAdvancedSettingsUpdate,
    ],
  )

  const handleMacosAccessibilityContextToggle = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const enabled = e.target.checked
      setMacosAccessibilityContextEnabled(enabled)
      scheduleAdvancedSettingsUpdate(llm, grammarServiceEnabled, enabled)
    },
    [
      llm,
      grammarServiceEnabled,
      setMacosAccessibilityContextEnabled,
      scheduleAdvancedSettingsUpdate,
    ],
  )

  const handleRestoreDefaults = useCallback(() => {
    const defaultLlmSettings: LlmSettings = {
      asrProvider: null,
      asrModel: null,
      asrPrompt: null,
      llmProvider: null,
      llmModel: null,
      llmTemperature: null,
      transcriptionPrompt: null,
      editingPrompt: null,
      noSpeechThreshold: null,
    }
    setLlmSettings(defaultLlmSettings)
    scheduleAdvancedSettingsUpdate(
      defaultLlmSettings,
      grammarServiceEnabled,
      macosAccessibilityContextEnabled,
    )
  }, [
    grammarServiceEnabled,
    macosAccessibilityContextEnabled,
    setLlmSettings,
    scheduleAdvancedSettingsUpdate,
  ])

  return (
    <div className="max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-500 scrollbar-track-transparent">
      {/* LLM Settings Section */}
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3 ml-1 mr-1">
            <h3 className="text-md font-medium text-slate-900">LLM Settings</h3>
            <button
              onClick={handleRestoreDefaults}
              className="px-3 py-1 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Restore Defaults
            </button>
          </div>
          <div className="space-y-3">
            {llmSettingsConfig.map(config => (
              <SettingInput
                key={config.name}
                config={config}
                value={getDisplayValue(config.name)}
                onChange={handleInputChange}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-md font-medium text-slate-900 mb-3 ml-1">
            Grammar
          </h3>
          <label className="flex items-start gap-3 ml-1">
            <input
              type="checkbox"
              checked={grammarServiceEnabled}
              onChange={handleGrammarServiceToggle}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700">
                Enable Grammar Service
              </span>
              <span className="block text-xs text-slate-500 mt-1">
                Apply Ito's local grammar adjustments before inserting text.
              </span>
            </span>
          </label>
        </div>

        {windowContext?.window?.platform === 'darwin' && (
          <div>
            <h3 className="text-md font-medium text-slate-900 mb-3 ml-1">
              Context
            </h3>
            <label className="flex items-start gap-3 ml-1">
              <input
                type="checkbox"
                checked={macosAccessibilityContextEnabled}
                onChange={handleMacosAccessibilityContextToggle}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-700">
                  Use Accessibility Context
                </span>
                <span className="block text-xs text-slate-500 mt-1">
                  Use Accessibility APIs to capture text context around the
                  cursor for improved accuracy.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
