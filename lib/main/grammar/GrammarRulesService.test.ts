import { describe, test, expect } from 'bun:test'
import { GrammarRulesService } from './GrammarRulesService'

describe('GrammarRulesService', () => {
  describe('setCaseFirstWord', () => {
    describe('Proper Noun Capitalization', () => {
      test('should always capitalize proper names regardless of context', () => {
        const grammarService = new GrammarRulesService('hello')
        const result = grammarService.setCaseFirstWord('john went to the store')
        expect(result).toBe('John went to the store')
      })

      test('should always capitalize place names', () => {
        const grammarService = new GrammarRulesService('hello')
        const result = grammarService.setCaseFirstWord('california is sunny')
        expect(result).toBe('California is sunny')
      })

      test('should always capitalize organization names', () => {
        const grammarService = new GrammarRulesService('hello')
        const result = grammarService.setCaseFirstWord(
          'microsoft released an update',
        )
        expect(result).toBe('Microsoft released an update')
      })

      test('should always capitalize days of the week', () => {
        const grammarService = new GrammarRulesService('hello')
        const result = grammarService.setCaseFirstWord('monday is busy')
        expect(result).toBe('Monday is busy')
      })

      test('should always capitalize months', () => {
        const grammarService = new GrammarRulesService('hello')
        const result = grammarService.setCaseFirstWord('january is cold')
        expect(result).toBe('January is cold')
      })
    })

    describe('Context-based Capitalization', () => {
      test('should capitalize after sentence endings', () => {
        const grammarService = new GrammarRulesService('Good morning.')
        const result = grammarService.setCaseFirstWord('hello world')
        expect(result).toBe('Hello world')
      })

      test('should capitalize after exclamation marks', () => {
        const grammarService = new GrammarRulesService('Great job!')
        const result = grammarService.setCaseFirstWord('wow that is amazing')
        expect(result).toBe('Wow that is amazing')
      })

      test('should capitalize after question marks', () => {
        const grammarService = new GrammarRulesService('How are you?')
        const result = grammarService.setCaseFirstWord('yes it is')
        expect(result).toBe('Yes it is')
      })

      test('should not capitalize after commas', () => {
        const grammarService = new GrammarRulesService('We walked,')
        const result = grammarService.setCaseFirstWord('and then we went')
        expect(result).toBe('and then we went')
      })

      test('should not capitalize after semicolons', () => {
        const grammarService = new GrammarRulesService('We did this;')
        const result = grammarService.setCaseFirstWord('but first this')
        expect(result).toBe('but first this')
      })

      test('should not capitalize mid-sentence', () => {
        const grammarService = new GrammarRulesService('We went')
        const result = grammarService.setCaseFirstWord('and then we left')
        expect(result).toBe('and then we left')
      })

      test('should capitalize with empty context', () => {
        const grammarService = new GrammarRulesService('')
        const result = grammarService.setCaseFirstWord('hello world')
        expect(result).toBe('Hello world')
      })
    })

    describe('Edge Cases', () => {
      test('should handle multi-word proper nouns', () => {
        const grammarService = new GrammarRulesService('hello')
        const result = grammarService.setCaseFirstWord('new york is big')
        expect(result).toBe('new york is big') // Only first word checked, "new" is not a proper noun
      })

      test('should handle transcript with leading/trailing whitespace', () => {
        const grammarService = new GrammarRulesService('Hi.')
        const result = grammarService.setCaseFirstWord('  hello world  ')
        expect(result).toBe('  Hello world  ')
      })

      test('should handle context with only whitespace', () => {
        const grammarService = new GrammarRulesService('   ')
        const result = grammarService.setCaseFirstWord('hello')
        expect(result).toBe('Hello')
      })

      test('should handle very short words', () => {
        const grammarService = new GrammarRulesService('Hi.')
        const result = grammarService.setCaseFirstWord('i am here')
        expect(result).toBe('I am here')
      })

      test('should handle empty transcript', () => {
        const grammarService = new GrammarRulesService('Hello world')
        const result = grammarService.setCaseFirstWord('')
        expect(result).toBe('')
      })

      test('should handle transcript with only punctuation', () => {
        const grammarService = new GrammarRulesService('Hello.')
        const result = grammarService.setCaseFirstWord('...')
        expect(result).toBe('...')
      })

      test('should handle transcript starting with numbers', () => {
        const grammarService = new GrammarRulesService('Hello.')
        const result = grammarService.setCaseFirstWord('42 is the answer')
        expect(result).toBe('42 Is the answer') // Should capitalize first letter found ("I" in "is")
      })
    })
  })

  describe('addLeadingSpaceIfNeeded', () => {
    describe('Leading Space Logic', () => {
      test('should add space after letters', () => {
        const grammarService = new GrammarRulesService('word')
        const result = grammarService.addLeadingSpaceIfNeeded('Hello')
        expect(result).toBe(' Hello')
      })

      test('should add space after numbers', () => {
        const grammarService = new GrammarRulesService('123')
        const result = grammarService.addLeadingSpaceIfNeeded('Hello')
        expect(result).toBe(' Hello')
      })

      test('should add space after closing punctuation', () => {
        const grammarService = new GrammarRulesService('done)')
        const result = grammarService.addLeadingSpaceIfNeeded('Hello')
        expect(result).toBe(' Hello')
      })

      test('should not add space after existing whitespace', () => {
        const grammarService = new GrammarRulesService('word ')
        const result = grammarService.addLeadingSpaceIfNeeded('Hello')
        expect(result).toBe('Hello')
      })

      test('should not add space after tabs', () => {
        const grammarService = new GrammarRulesService('word\t')
        const result = grammarService.addLeadingSpaceIfNeeded('Hello')
        expect(result).toBe('Hello')
      })

      test('should not add space after newlines', () => {
        const grammarService = new GrammarRulesService('word\n')
        const result = grammarService.addLeadingSpaceIfNeeded('Hello')
        expect(result).toBe('Hello')
      })

      test('should not add space after opening punctuation', () => {
        const grammarService = new GrammarRulesService('word(')
        const result = grammarService.addLeadingSpaceIfNeeded('Hello')
        expect(result).toBe('Hello')
      })

      test('should not add space after quotes', () => {
        const grammarService = new GrammarRulesService('He said "')
        const result = grammarService.addLeadingSpaceIfNeeded('Hello')
        expect(result).toBe('Hello')
      })

      test('should not add space with empty context', () => {
        const grammarService = new GrammarRulesService('')
        const result = grammarService.addLeadingSpaceIfNeeded('Hello')
        expect(result).toBe('Hello')
      })

      test('should handle empty transcript', () => {
        const grammarService = new GrammarRulesService('Hello world')
        const result = grammarService.addLeadingSpaceIfNeeded('')
        expect(result).toBe('')
      })
    })
  })

  describe('Combined Usage Examples', () => {
    test('should capitalize proper noun and add space when used together', () => {
      const grammarService = new GrammarRulesService('Hi')
      let result = grammarService.setCaseFirstWord('john is here')
      result = grammarService.addLeadingSpaceIfNeeded(result)
      expect(result).toBe(' John is here')
    })

    test('should capitalize after period and add space when used together', () => {
      const grammarService = new GrammarRulesService('Done.')
      let result = grammarService.setCaseFirstWord('this is great')
      result = grammarService.addLeadingSpaceIfNeeded(result)
      expect(result).toBe(' This is great')
    })

    test('should handle proper noun without adding space (after whitespace)', () => {
      const grammarService = new GrammarRulesService('Hi ')
      let result = grammarService.setCaseFirstWord('mary called')
      result = grammarService.addLeadingSpaceIfNeeded(result)
      expect(result).toBe('Mary called')
    })
  })
})
