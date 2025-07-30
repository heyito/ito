import { z } from 'zod'

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
