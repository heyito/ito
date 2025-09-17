import { describe, test, expect } from 'bun:test'
import { GrammarRulesService } from './GrammarRulesService'

describe('GrammarRulesService', () => {
  const grammarService = new GrammarRulesService()

  describe('setCaseFirstWord', () => {
    describe('Proper Noun Capitalization', () => {
      test('should always capitalize proper names regardless of context', () => {
        const result = grammarService.setCaseFirstWord(
          'hello',
          'john went to the store',
        )
        expect(result).toBe('John went to the store')
      })

      test('should always capitalize place names', () => {
        const result = grammarService.setCaseFirstWord(
          'hello',
          'california is sunny',
        )
        expect(result).toBe('California is sunny')
      })

      test('should always capitalize organization names', () => {
        const result = grammarService.setCaseFirstWord(
          'hello',
          'microsoft released an update',
        )
        expect(result).toBe('Microsoft released an update')
      })

      test('should always capitalize days of the week', () => {
        const result = grammarService.setCaseFirstWord(
          'hello',
          'monday is busy',
        )
        expect(result).toBe('Monday is busy')
      })

      test('should always capitalize months', () => {
        const result = grammarService.setCaseFirstWord(
          'hello',
          'january is cold',
        )
        expect(result).toBe('January is cold')
      })
    })

    describe('Context-based Capitalization', () => {
      test('should capitalize after sentence endings', () => {
        const result = grammarService.setCaseFirstWord(
          'Good morning.',
          'hello world',
        )
        expect(result).toBe('Hello world')
      })

      test('should capitalize after exclamation marks', () => {
        const result = grammarService.setCaseFirstWord(
          'Great job!',
          'wow that is amazing',
        )
        expect(result).toBe('Wow that is amazing')
      })

      test('should capitalize after question marks', () => {
        const result = grammarService.setCaseFirstWord(
          'How are you?',
          'yes it is',
        )
        expect(result).toBe('Yes it is')
      })

      test('should not capitalize after commas', () => {
        const result = grammarService.setCaseFirstWord(
          'We walked,',
          'and then we went',
        )
        expect(result).toBe('and then we went')
      })

      test('should not capitalize after semicolons', () => {
        const result = grammarService.setCaseFirstWord(
          'We did this;',
          'but first this',
        )
        expect(result).toBe('but first this')
      })

      test('should not capitalize mid-sentence', () => {
        const result = grammarService.setCaseFirstWord(
          'We went',
          'and then we left',
        )
        expect(result).toBe('and then we left')
      })

      test('should capitalize with empty context', () => {
        const result = grammarService.setCaseFirstWord('', 'hello world')
        expect(result).toBe('Hello world')
      })
    })

    describe('Edge Cases', () => {
      test('should handle multi-word proper nouns', () => {
        const result = grammarService.setCaseFirstWord(
          'hello',
          'new york is big',
        )
        expect(result).toBe('new york is big') // Only first word checked, "new" is not a proper noun
      })

      test('should handle transcript with leading/trailing whitespace', () => {
        const result = grammarService.setCaseFirstWord('Hi.', '  hello world  ')
        expect(result).toBe('  Hello world  ')
      })

      test('should handle context with only whitespace', () => {
        const result = grammarService.setCaseFirstWord('   ', 'hello')
        expect(result).toBe('Hello')
      })

      test('should handle very short words', () => {
        const result = grammarService.setCaseFirstWord('Hi.', 'i am here')
        expect(result).toBe('I am here')
      })

      test('should handle empty transcript', () => {
        const result = grammarService.setCaseFirstWord('Hello world', '')
        expect(result).toBe('')
      })

      test('should handle transcript with only punctuation', () => {
        const result = grammarService.setCaseFirstWord('Hello.', '...')
        expect(result).toBe('...')
      })

      test('should handle transcript starting with numbers', () => {
        const result = grammarService.setCaseFirstWord(
          'Hello.',
          '42 is the answer',
        )
        expect(result).toBe('42 Is the answer') // Should capitalize first letter found ("I" in "is")
      })
    })
  })

  describe('addLeadingSpaceIfNeeded', () => {
    describe('Leading Space Logic', () => {
      test('should add space after letters', () => {
        const result = grammarService.addLeadingSpaceIfNeeded('word', 'Hello')
        expect(result).toBe(' Hello')
      })

      test('should add space after numbers', () => {
        const result = grammarService.addLeadingSpaceIfNeeded('123', 'Hello')
        expect(result).toBe(' Hello')
      })

      test('should add space after closing punctuation', () => {
        const result = grammarService.addLeadingSpaceIfNeeded('done)', 'Hello')
        expect(result).toBe(' Hello')
      })

      test('should not add space after existing whitespace', () => {
        const result = grammarService.addLeadingSpaceIfNeeded('word ', 'Hello')
        expect(result).toBe('Hello')
      })

      test('should not add space after tabs', () => {
        const result = grammarService.addLeadingSpaceIfNeeded('word\t', 'Hello')
        expect(result).toBe('Hello')
      })

      test('should not add space after newlines', () => {
        const result = grammarService.addLeadingSpaceIfNeeded('word\n', 'Hello')
        expect(result).toBe('Hello')
      })

      test('should not add space after opening punctuation', () => {
        const result = grammarService.addLeadingSpaceIfNeeded('word(', 'Hello')
        expect(result).toBe('Hello')
      })

      test('should not add space after quotes', () => {
        const result = grammarService.addLeadingSpaceIfNeeded(
          'He said "',
          'Hello',
        )
        expect(result).toBe('Hello')
      })

      test('should not add space with empty context', () => {
        const result = grammarService.addLeadingSpaceIfNeeded('', 'Hello')
        expect(result).toBe('Hello')
      })

      test('should handle empty transcript', () => {
        const result = grammarService.addLeadingSpaceIfNeeded('Hello world', '')
        expect(result).toBe('')
      })
    })
  })

  describe('Combined Usage Examples', () => {
    test('should capitalize proper noun and add space when used together', () => {
      let result = grammarService.setCaseFirstWord('Hi', 'john is here')
      result = grammarService.addLeadingSpaceIfNeeded('Hi', result)
      expect(result).toBe(' John is here')
    })

    test('should capitalize after period and add space when used together', () => {
      let result = grammarService.setCaseFirstWord('Done.', 'this is great')
      result = grammarService.addLeadingSpaceIfNeeded('Done.', result)
      expect(result).toBe(' This is great')
    })

    test('should handle proper noun without adding space (after whitespace)', () => {
      let result = grammarService.setCaseFirstWord('Hi ', 'mary called')
      result = grammarService.addLeadingSpaceIfNeeded('Hi ', result)
      expect(result).toBe('Mary called')
    })
  })
})
