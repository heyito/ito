import { useState } from 'react'
import { Button } from '@/app/components/ui/button'

interface SelectedTextResult {
  success: boolean
  text: string | null
  error: string | null
  length: number
}

export function SelectedTextTester() {
  const [result, setResult] = useState<SelectedTextResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasText, setHasText] = useState<boolean | null>(null)

  const testGetSelectedText = async () => {
    setLoading(true)
    try {
      const result = await window.api.selectedText.get({ format: 'json' })
      setResult(result)
    } catch (error) {
      setResult({
        success: false,
        text: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        length: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  const testGetSelectedTextString = async () => {
    setLoading(true)
    try {
      console.log('Fetching selected text as string...')
      await new Promise(resolve => setTimeout(resolve, 3000)) // Simulate delay
      const text = await window.api.selectedText.getString()
      setResult({
        success: true,
        text,
        error: null,
        length: text ? text.length : 0,
      })
    } catch (error) {
      setResult({
        success: false,
        text: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        length: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  const testHasSelectedText = async () => {
    setLoading(true)
    try {
      const hasSelected = await window.api.selectedText.hasSelected()
      setHasText(hasSelected)
    } catch (error) {
      console.error('Error checking for selected text:', error)
      setHasText(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 border rounded-lg bg-background">
      <h3 className="text-lg font-semibold mb-4">Selected Text Reader Test</h3>

      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={testGetSelectedText}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            Get Selected Text (JSON)
          </Button>

          <Button
            onClick={testGetSelectedTextString}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            Get Selected Text (String)
          </Button>

          <Button
            onClick={testHasSelectedText}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            Has Selected Text?
          </Button>
        </div>

        {loading && (
          <div className="text-sm text-muted-foreground">
            Checking for selected text...
          </div>
        )}

        {hasText !== null && (
          <div className="p-3 border rounded bg-muted/50">
            <div className="text-sm font-medium">Has Selected Text:</div>
            <div className="text-sm">{hasText ? 'Yes' : 'No'}</div>
          </div>
        )}

        {result && (
          <div className="p-3 border rounded bg-muted/50">
            <div className="text-sm font-medium mb-2">
              Selected Text Result:
            </div>
            <div className="space-y-1 text-sm">
              <div>
                <span className="font-medium">Success:</span>{' '}
                <span
                  className={result.success ? 'text-green-600' : 'text-red-600'}
                >
                  {result.success ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="font-medium">Length:</span> {result.length}
              </div>
              {result.text && (
                <div>
                  <span className="font-medium">Text:</span>
                  <div className="mt-1 p-2 bg-background border rounded text-xs font-mono max-h-32 overflow-y-auto">
                    {result.text}
                  </div>
                </div>
              )}
              {result.error && (
                <div>
                  <span className="font-medium text-red-600">Error:</span>
                  <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    {result.error}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p>
            <strong>Instructions:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1 mt-1">
            <li>Select some text anywhere on your system (in any app)</li>
            <li>
              Click one of the buttons above to test the selected text reader
            </li>
            <li>
              The result will show the selected text or indicate if none is
              selected
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}
