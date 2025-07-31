import { getNativeBinaryPath } from './native-interface'

const nativeModuleName = 'active-application'

export async function getActiveWindow() {
  const path = getNativeBinaryPath(nativeModuleName)
  if (!path) {
    console.error(`Cannot determine ${nativeModuleName} binary path`)
    return null
  }
}
