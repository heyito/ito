import { execFile } from 'child_process'
import { platform, arch } from 'os'
import { getNativeBinaryPath } from './native-interface'

interface SelectedTextOptions {
  format?: 'json' | 'text' // Output format
  maxLength?: number // Maximum length of text to return
}

interface SelectedTextResult {
  success: boolean
  text: string | null
  error: string | null
  length: number
}

const nativeModuleName = 'selected-text-reader'

export function getSelectedText(
  options: SelectedTextOptions = { format: 'json', maxLength: 10000 },
): Promise<SelectedTextResult> {
  return new Promise(resolve => {
    const binaryPath = getNativeBinaryPath(nativeModuleName)
    if (!binaryPath) {
      console.error(
        `Cannot determine ${nativeModuleName} binary path for platform ${platform()} and arch ${arch()}`,
      )
      return resolve({
        success: false,
        text: null,
        error: `Binary not found for platform ${platform()} and arch ${arch()}`,
        length: 0,
      })
    }

    const args: string[] = []

    // Add format argument
    if (options.format) {
      args.push('--format', options.format)
    }

    // Add max length argument
    if (options.maxLength !== undefined) {
      args.push('--max-length', options.maxLength.toString())
    }

    execFile(binaryPath, args, (err, stdout, stderr) => {
      if (err) {
        console.error(`${nativeModuleName} error:`, stderr)
        return resolve({
          success: false,
          text: null,
          error: stderr || err.message,
          length: 0,
        })
      }

      if (options.format === 'text') {
        // For text format, return the raw output
        return resolve({
          success: true,
          text: stdout || null,
          error: null,
          length: stdout ? stdout.length : 0,
        })
      }

      // For JSON format (default), parse the response
      try {
        const result = JSON.parse(stdout) as SelectedTextResult
        resolve(result)
      } catch (parseError) {
        console.error('Error parsing selected text result:', parseError)
        resolve({
          success: false,
          text: null,
          error: `Failed to parse JSON response: ${parseError}`,
          length: 0,
        })
      }
    })
  })
}

/**
 * Get selected text as plain string (convenience method)
 */
export async function getSelectedTextString(
  maxLength: number = 10000,
): Promise<string | null> {
  try {
    const result = await getSelectedText({ format: 'json', maxLength })
    return result.success ? result.text : null
  } catch (error) {
    console.error('Error getting selected text:', error)
    return null
  }
}

/**
 * Check if there is any selected text available
 */
export async function hasSelectedText(): Promise<boolean> {
  try {
    const result = await getSelectedText({ format: 'json', maxLength: 1 })
    return result.success && result.length > 0
  } catch (error) {
    console.error('Error checking for selected text:', error)
    return false
  }
}
