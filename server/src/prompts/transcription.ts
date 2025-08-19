/**
 * Estimates token count using rough approximation (1 token ≈ 4 characters)
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Creates a transcription prompt that stays within the 224 token limit
 */
export function createTranscriptionPrompt(vocabulary: string[]): string {
  const suffix = ''
  const maxTokens = 224

  // If no vocabulary, just return the base instruction
  if (vocabulary.length === 0) {
    const finalTokenCount = estimateTokenCount(suffix)
    console.log(`Transcription prompt: ${finalTokenCount} estimated tokens`)
    return suffix
  }

  const basePrompt = 'Dictionary entries include: '

  // Calculate tokens for base prompt and suffix
  const baseTokens = estimateTokenCount(basePrompt + '. ' + suffix)
  const availableTokensForVocab = maxTokens - baseTokens

  let vocabString = vocabulary.join(', ')
  let wasTruncated = false

  // Truncate vocabulary if it exceeds available tokens
  if (estimateTokenCount(vocabString) > availableTokensForVocab) {
    const maxVocabLength = availableTokensForVocab * 4 - 10 // Leave buffer
    const originalLength = vocabString.length
    vocabString = vocabString
      .substring(0, maxVocabLength)
      .replace(/,\s*[^,]*$/, '') // Remove incomplete last term
    wasTruncated = true
    console.log(
      `Vocabulary truncated from ${originalLength} to ${vocabString.length} characters to stay within token limit`,
    )
  }

  // If vocabulary string is empty after processing, return just the suffix
  if (vocabString.trim() === '') {
    const finalTokenCount = estimateTokenCount(suffix)
    console.log(`Transcription prompt: ${finalTokenCount} estimated tokens`)
    return suffix
  }

  const finalPrompt = `${basePrompt}${vocabString}. ${suffix}`
  const finalTokenCount = estimateTokenCount(finalPrompt)

  console.log(
    `Transcription prompt: ${finalTokenCount} estimated tokens${wasTruncated ? ' (vocabulary truncated)' : ''}`,
  )

  return finalPrompt
}
