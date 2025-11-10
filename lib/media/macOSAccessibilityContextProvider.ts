/**
 * macOS Accessibility Context Provider Implementation
 *
 * Uses a one-shot Swift binary that retrieves cursor context
 * using macOS NSAccessibility/AXUIElement APIs.
 */

import { execFile } from 'child_process'
import { platform, arch } from 'os'
import { getNativeBinaryPath } from './native-interface'
import log from 'electron-log'
import type { IAccessibilityContextProvider } from './IAccessibilityContextProvider'
import type {
  CursorContextOptions,
  CursorContextResult,
} from '../types/cursorContext'

const NATIVE_MODULE_NAME = 'cursor-context'
export class MacOSAccessibilityContextProvider
  implements IAccessibilityContextProvider
{
  #binaryPath: string | null = null

  constructor() {}

  public initialize(): void {
    const binaryPath = getNativeBinaryPath(NATIVE_MODULE_NAME)
    if (!binaryPath) {
      const error = new Error(
        `Cannot determine ${NATIVE_MODULE_NAME} binary path for platform ${platform()} and arch ${arch()}`,
      )
      log.error('[MacOSAccessibilityContextProvider]', error.message)
      throw error
    }

    this.#binaryPath = binaryPath
    console.log(
      `[MacOSAccessibilityContextProvider] Initialized with binary path: ${binaryPath}`,
    )
  }

  public shutdown(): void {
    // No-op for one-shot process
  }

  public isRunning(): boolean {
    return this.#binaryPath !== null
  }

  public async getCursorContext(
    options: CursorContextOptions,
  ): Promise<CursorContextResult> {
    if (!this.#binaryPath) {
      throw new Error('Provider not initialized. Call initialize() first.')
    }

    return new Promise((resolve, reject) => {
      const args = [
        '--before',
        String(options.maxCharsBefore),
        '--after',
        String(options.maxCharsAfter),
      ]

      // Enable debug logging if requested
      if (options.debug) {
        args.push('--debug')
      }

      execFile(
        this.#binaryPath!,
        args,
        { timeout: options.timeout },
        (error, stdout, stderr) => {
          if (error) {
            log.error(
              '[MacOSAccessibilityContextProvider] execFile error:',
              error,
            )
            reject(error)
            return
          }

          if (stderr) {
            console.log(
              '[MacOSAccessibilityContextProvider] stderr:',
              stderr.trim(),
            )
          }

          try {
            const result: CursorContextResult = JSON.parse(stdout.trim())
            console.log(
              '[MacOSAccessibilityContextProvider] Retrieved cursor context:',
              result,
            )
            resolve(result)
          } catch (parseError) {
            log.error(
              '[MacOSAccessibilityContextProvider] Failed to parse JSON:',
              parseError,
            )
            reject(new Error('Failed to parse response from native binary'))
          }
        },
      )
    })
  }
}

// Export singleton instance
export const macOSAccessibilityContextProvider =
  new MacOSAccessibilityContextProvider()
