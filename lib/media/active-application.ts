import { execFile } from 'child_process'
import { getNativeBinaryPath } from './native-interface'

const nativeModuleName = 'active-application'

export type ActiveWindow = {
  title: string
  appName: string
  windowId: number
  processId: number
  positon: {
    x: number
    y: number
    width: number
    height: number
  }
}

export async function getActiveWindow(): Promise<ActiveWindow | null> {
  const path = getNativeBinaryPath(nativeModuleName)
  if (!path) {
    console.error(`Cannot determine ${nativeModuleName} binary path`)
    return null
  }

  const result = (await new Promise(resolve => {
    execFile(path, (err, stdout, stderr) => {
      if (err) {
        console.error(`${nativeModuleName} error:`, err, stderr)
        return resolve('null')
      }
      return resolve(stdout.trim())
    })
  })) as string

  if (result) {
    return JSON.parse(result) as ActiveWindow
  } else {
    return null
  }
}
