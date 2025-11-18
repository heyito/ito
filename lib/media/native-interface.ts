import { app } from 'electron'
import os from 'os'
import { join } from 'path'

const platform = os.platform()
const isDev = !app.isPackaged

export const getNativeBinaryPath = (
  nativeModuleName: string,
): string | null => {
  const targetDir = getTargetDir(nativeModuleName)
  const binaryName =
    platform === 'win32' ? `${nativeModuleName}.exe` : `${nativeModuleName}`

  if (!targetDir) {
    console.error(
      `Cannot determine ${nativeModuleName} binary path for platform ${os.platform()}`,
    )
    return null
  }
  return join(targetDir, binaryName)
}

const getTargetDir = (nativeModuleName: string): string | null => {
  if (isDev) {
    const targetBase = join(
      __dirname,
      `../../native/${nativeModuleName}/target`,
    )

    if (platform === 'darwin') {
      return join(targetBase, 'universal')
    } else if (platform === 'win32') {
      return join(targetBase, 'x86_64-pc-windows-msvc/release')
    }
    // Fallback for unsupported dev platforms
    return null
  }
  return join(process.resourcesPath, 'binaries')
}
