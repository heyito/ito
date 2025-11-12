import { Button } from '@/app/components/ui/button'
import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from '@/app/components/ui/dialog'
import { ISO_639_1_LANGUAGES } from '@/lib/constants/languages'
import * as flags from 'country-flag-icons/react/3x2'

interface LanguageSelectorProps {
  selectedLanguageCode?: string
  onSelectionChange: (languageCode: string) => void
  triggerButtonText?: string
  triggerButtonVariant?:
    | 'default'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
    | 'destructive'
  triggerButtonClassName?: string
}

// Helper to get the flag component for a country code
const getFlag = (countryCode?: string) => {
  if (!countryCode) return null
  const FlagComponent = flags[countryCode as keyof typeof flags]
  return FlagComponent ? <FlagComponent className="w-6 h-4" /> : null
}

export function LanguageSelector({
  selectedLanguageCode,
  onSelectionChange,
  triggerButtonText = 'Select Language',
  triggerButtonVariant = 'outline',
  triggerButtonClassName = '',
}: LanguageSelectorProps) {
  const [tempSelectedLanguage, setTempSelectedLanguage] = useState<string>(
    selectedLanguageCode || 'auto',
  )
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setTempSelectedLanguage(selectedLanguageCode || 'auto')
  }, [selectedLanguageCode])

  // Reset search when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
    }
  }, [isOpen])

  const handleLanguageSelect = (languageCode: string) => {
    setTempSelectedLanguage(languageCode)
  }

  const handleDialogClose = () => {
    if (tempSelectedLanguage !== selectedLanguageCode) {
      onSelectionChange(tempSelectedLanguage)
    }
    setIsOpen(false)
  }

  const selectedLanguage = ISO_639_1_LANGUAGES.find(
    lang => lang.code === selectedLanguageCode,
  ) || { code: 'auto', name: 'Auto-detect' }

  // Filter languages based on search query
  const filteredLanguages = ISO_639_1_LANGUAGES.filter(lang =>
    lang.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const selectedFlag = getFlag(selectedLanguage.countryCode)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant={triggerButtonVariant}
          className={triggerButtonClassName}
          type="button"
        >
          {triggerButtonText === 'Select Language' && selectedLanguageCode ? (
            <div className="flex items-center gap-2">
              {selectedLanguage.code === 'auto' ? (
                <span className="text-base">🌐</span>
              ) : (
                <div className="w-5 h-3 flex-shrink-0">{selectedFlag}</div>
              )}
              <span>{selectedLanguage.name}</span>
            </div>
          ) : (
            triggerButtonText
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="!border-0 shadow-lg p-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Select Language</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a language for speech transcription
        </DialogDescription>
        <div className="px-8 pt-8 pb-4">
          <input
            type="text"
            placeholder="Search languages..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto space-y-3 px-8">
          {filteredLanguages.map(lang => {
            const flag = getFlag(lang.countryCode)
            return (
              <div
                key={lang.code}
                className={`p-6 rounded-md cursor-pointer transition-colors max-w-full overflow-hidden ${
                  tempSelectedLanguage === lang.code
                    ? 'bg-purple-50 border-2 border-purple-100'
                    : 'bg-neutral-100 border-2 border-neutral-100 hover:bg-neutral-200'
                }`}
                onClick={() => handleLanguageSelect(lang.code)}
                style={{ minWidth: 0 }}
              >
                <div
                  className="font-medium text-base truncate flex items-center gap-3"
                  style={{ maxWidth: '100%' }}
                >
                  {lang.code === 'auto' ? (
                    <span className="text-2xl">🌐</span>
                  ) : (
                    <div className="w-6 h-4 flex-shrink-0">{flag}</div>
                  )}
                  <span>{lang.name}</span>
                </div>
              </div>
            )
          })}
          {filteredLanguages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No languages found matching "{searchQuery}"
            </div>
          )}
        </div>
        <div className="flex justify-end px-8 pb-8 pt-6">
          <DialogClose asChild>
            <Button className="w-32" type="button" onClick={handleDialogClose}>
              Save and close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
