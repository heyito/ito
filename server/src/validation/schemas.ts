import { z } from 'zod'
import { ClientProvider } from '../clients/providers.js'

// ASR model schema - allows known models or any string matching pattern
export const AsrModelSchema = z
  .string()
  .transform(val => val.trim())
  .refine(val => val.length > 0, 'ASR model cannot be empty')
  .refine(val => val.length <= 100, 'ASR model too long')
  .refine(
    val => /^[a-zA-Z0-9\-_.]+$/.test(val),
    'ASR model contains invalid characters',
  )

export const AsrProviderSchema = z.preprocess(
  val => (typeof val === 'string' ? val.trim() : val),
  z.enum([ClientProvider.GROQ]),
)

export const AsrPromptSchema = z.string().trim().max(100, 'ASR prompt too long')

export const LlmProviderSchema = z.preprocess(
  val => (typeof val === 'string' ? val.trim() : val),
  z.enum([ClientProvider.GROQ]),
)

export const LlmModelSchema = z
  .string()
  .transform(val => val.trim())
  .refine(val => val.length > 0, 'LLM model cannot be empty')
  .refine(val => val.length <= 100, 'LLM model too long')
  .refine(
    val => /^[a-zA-Z0-9\-_./]+$/.test(val),
    'LLM model contains invalid characters',
  )

export const LLMTemperatureSchema = z
  .number()
  .min(0, 'Temperature must be at least 0')
  .max(2, 'Temperature cannot exceed 2')

export const LlmPromptSchema = z.string().trim().max(500, 'LLM prompt too long')

export const NoSpeechThresholdSchema = z
  .number()
  .min(0, 'No speech probability must be at least 0')
  .max(1, 'No speech probability cannot exceed 1')

export const LowQualityThreshold = z
  .number()
  .min(-1, 'Low quality threshold cammot be less than -1')
  .max(0, 'Low quality threshold cannot exceed 0')

// Individual vocabulary word schema
export const VocabularyWordSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9\-_.\s']+$/, 'Invalid vocabulary word characters')

// Vocabulary list schema
export const VocabularySchema = z
  .string()
  .trim()
  .max(5000, 'Vocabulary list too long')
  .transform(str => {
    if (!str) return []

    return str
      .split(',')
      .map(word => word.trim())
      .filter(word => word.length > 0)
      .slice(0, 500) // Limit number of words
      .filter(word => {
        // Validate each word individually
        try {
          VocabularyWordSchema.parse(word)
          return true
        } catch {
          return false
        }
      })
  })

// Header validation schema
export const HeaderSchema = z.object({
  asrModel: AsrModelSchema.optional(),
  vocabulary: VocabularySchema.optional(),
})

export type ValidatedHeaders = z.infer<typeof HeaderSchema>
