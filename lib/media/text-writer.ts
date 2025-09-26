import { execFile } from 'child_process'
import { platform, arch } from 'os'
import { getNativeBinaryPath } from './native-interface'
import { setProgrammaticTyping } from './typingState'
import { timingService, TimingEvent } from '../main/timingService'

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
    setProgrammaticTyping(true)
    const binaryPath = getNativeBinaryPath(nativeModuleName)
    if (!binaryPath) {
      console.error(
        `Cannot determine ${nativeModuleName} binary path for platform ${platform()} and arch ${arch()}`,
      )
      setProgrammaticTyping(false)
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

    // Determine if this is paste or type based on char delay
    const isPaste = options.charDelay === 0
    const startEvent = isPaste ? TimingEvent.OUTPUT_PASTE_START : TimingEvent.OUTPUT_TYPE_START
    const completeEvent = isPaste ? TimingEvent.OUTPUT_PASTE_COMPLETE : TimingEvent.OUTPUT_TYPE_COMPLETE

    // Record timing for output method start
    timingService.recordEvent(startEvent, {
      textLength: text.length,
      delay: options.delay,
      charDelay: options.charDelay
    })

    execFile(binaryPath, args, (err, _stdout, stderr) => {
      if (err) {
        console.error('text-writer error:', stderr)
        setProgrammaticTyping(false)

        // Record timing for output method complete (with error)
        timingService.recordEvent(completeEvent, {
          success: false,
          error: stderr
        })

        return resolve(false)
      }
      setProgrammaticTyping(false)

      // Record timing for output method complete (success)
      timingService.recordEvent(completeEvent, {
        success: true
      })

      resolve(true)
    })
  })
}
