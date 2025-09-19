import { execFile } from 'child_process'
import { platform, arch } from 'os'
import { getNativeBinaryPath } from './native-interface'

interface TextWriterOptions {
  delay: number // Delay before typing (milliseconds)
  charDelay: number // Delay between characters (milliseconds)
}

const nativeModuleName = 'text-writer'

export function setFocusedText(
  text: string,
  options: TextWriterOptions = { delay: 0, charDelay: 0 },
): Promise<boolean> {
  return new Promise(resolve => {
    // Signal to the rest of the app that programmatic typing is active
    ;(globalThis as any).isProgrammaticTyping = true
    const binaryPath = getNativeBinaryPath(nativeModuleName)
    if (!binaryPath) {
      console.error(
        `Cannot determine ${nativeModuleName} binary path for platform ${platform()} and arch ${arch()}`,
      )
      ;(globalThis as any).isProgrammaticTyping = false
      return resolve(false)
    }

    const args: string[] = []

    // Add optional arguments
    if (options.delay !== undefined) {
      args.push('--delay', options.delay.toString())
    }
    if (options.charDelay !== undefined) {
      args.push('--char-delay', options.charDelay.toString())
    }

    // Add the text as the final argument with -- separator to prevent flag parsing
    args.push('--', text)

    execFile(binaryPath, args, (err, _stdout, stderr) => {
      if (err) {
        console.error('text-writer error:', stderr)
        ;(globalThis as any).isProgrammaticTyping = false
        return resolve(false)
      }
      ;(globalThis as any).isProgrammaticTyping = false
      resolve(true)
    })
  })
}
