import { execFile } from 'child_process'
import { join } from 'path'

const swiftBinaryPath = join(
  __dirname,
  '../../native/macos-text/.build/apple/Products/Release/focused-text-reader',
)

// TODO:
// This is a POC for the context output work, currently works with mac apps but not in browser views.

function readFocusedText(): Promise<string | null> {
  return new Promise(resolve => {
    execFile(swiftBinaryPath, (err, stdout, stderr) => {
      if (err) {
        console.error('focused-text-reader error:', err, stderr)
        return resolve(null)
      }
      resolve(stdout.trim())
    })
  })
}

;(async () => {
  await new Promise(resolve => setTimeout(resolve, 2500)) // Wait for the app to be ready
  const result = await readFocusedText()
  console.log('Focused text reader result:', result)
})()
