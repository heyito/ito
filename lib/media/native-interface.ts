import { app } from 'electron'
import os from 'os'
import { join } from 'path'
import fs from 'fs'

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
      const msvcDir = join(targetBase, 'x86_64-pc-windows-msvc/release')
      const gnuDir = join(targetBase, 'x86_64-pc-windows-gnu/release')
      if (fs.existsSync(msvcDir)) return msvcDir
      if (fs.existsSync(gnuDir)) return gnuDir
      return gnuDir
    }
    // Fallback for unsupported dev platforms
    return null
  }
  return join(process.resourcesPath, 'binaries')
}
