import nlp from 'compromise'

export class GrammarRulesService {
  private cursorContext: string = ''

  public constructor(context: string) {
    this.cursorContext = context
  }

  /**
   * Set first word case (uppercase or lowercase) based on stored cursor context
   */
  public setCaseFirstWord(transcript: string): string {
    if (!transcript) return transcript

    // If no cursor context available, just capitalize first letter
    if (!this.cursorContext) {
      const firstLetterIndex = transcript.search(/[a-zA-Z]/)
      if (firstLetterIndex >= 0) {
        return (
          transcript.substring(0, firstLetterIndex) +
          transcript.charAt(firstLetterIndex).toUpperCase() +
          transcript.substring(firstLetterIndex + 1)
        )
      }
      return transcript
    }

    let correctedText = transcript

    // Check if we should capitalize the first letter
    const firstWord = correctedText.trim().split(/\s+/)[0] || ''
    const shouldCapitalize = this.shouldCapitalizeBasedOnContext(
      this.cursorContext,
      firstWord,
    )

    const firstLetterIndex = correctedText.search(/[a-zA-Z]/)
    if (firstLetterIndex < 0) {
      return correctedText // No letters to capitalize
    }
    if (shouldCapitalize) {
      correctedText =
        correctedText.substring(0, firstLetterIndex) +
        correctedText.charAt(firstLetterIndex).toUpperCase() +
        correctedText.substring(firstLetterIndex + 1)
    } else {
      correctedText =
        correctedText.substring(0, firstLetterIndex) +
        correctedText.charAt(firstLetterIndex).toLowerCase() +
        correctedText.substring(firstLetterIndex + 1)
    }

    return correctedText
  }

  /**
   * Add leading space if needed based on stored cursor context
   */
  public addLeadingSpaceIfNeeded(transcript: string): string {
    if (!transcript) return transcript

    // Check if we need to add a space before the text
    const needsLeadingSpace = this.needsLeadingSpace(this.cursorContext)
    if (needsLeadingSpace) {
      return ' ' + transcript
    }

    return transcript
  }

  private needsLeadingSpace(context: string): boolean {
    if (!context || context.length === 0) {
      return false // No space needed if no context
    }

    // Don't add space if context already ends with whitespace
    if (
      context.endsWith(' ') ||
      context.endsWith('\t') ||
      context.endsWith('\n')
    ) {
      return false
    }

    const lastChar = context.charAt(context.length - 1)

    // Don't add space after opening punctuation
    const openingPunctuation = ['(', '[', '{', '"', "'", '`']
    if (openingPunctuation.includes(lastChar)) {
      return false
    }

    // Add space if context ends with a letter, number, or closing punctuation
    if (/[a-zA-Z0-9)\]}"'`.,;:!?]$/.test(context)) {
      return true
    }

    // For other cases, do add space
    return true
  }

  private isProperNoun(word: string): boolean {
    if (!word || word.trim().length === 0) return false

    const doc = nlp(word.trim())
    return (
      doc.has('#ProperNoun') ||
      doc.has('#Person') ||
      doc.has('#Place') ||
      doc.has('#Organization') ||
      doc.has('#WeekDay') ||
      doc.has('#Month')
    )
  }

  private shouldCapitalizeBasedOnContext(
    context: string,
    firstWord: string,
  ): boolean {
    // If the first word is a proper noun, ALWAYS capitalize
    if (this.isProperNoun(firstWord)) {
      return true
    }

    if (!context || context.trim().length === 0) {
      return true // Default to capitalize if no context
    }

    const trimmedContext = context.trim()

    // Capitalize after sentence endings (period, exclamation, question mark)
    const sentenceEndings = ['.', '!', '?']
    const lastChar = trimmedContext.charAt(trimmedContext.length - 1)

    if (sentenceEndings.includes(lastChar)) {
      return true
    }

    // Don't capitalize after commas, semicolons, colons, or within sentences
    const continuationPunctuation = [',', ';', ':', '-', '–', '—']
    if (continuationPunctuation.includes(lastChar)) {
      return false
    }

    // If context ends with a letter or number, don't capitalize (continuing a sentence)
    if (/[a-zA-Z0-9]$/.test(trimmedContext)) {
      return false
    }

    // Default to capitalize for other cases
    return true
  }
}
