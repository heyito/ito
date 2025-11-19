import { app } from 'electron'
import os from 'os'
import { join } from 'path'

const platform = os.platform()
const isDev = !app.isPackaged

export const getNativeBinaryPath = (
  nativeModuleName: string,
): string | null => {
  const targetDir = getTargetDir()
  const binaryName =
    platform === 'win32' ? `${nativeModuleName}.exe` : `${nativeModuleName}`

  if (!targetDir) {
    console.error(
      `Cannot determine ${nativeModuleName} binary path for platform ${platform}`,
    )
    return null
  }
  return join(targetDir, binaryName)
}

const getTargetDir = (): string | null => {
  if (isDev) {
    const targetBase = join(__dirname, '../../native/target')

    if (platform === 'darwin') {
      // Detect current architecture
      const arch = os.arch() // 'arm64' or 'x64'
      const cargoArch = arch === 'arm64' ? 'aarch64' : 'x86_64'
      const targetDir = join(targetBase, `${cargoArch}-apple-darwin/release`)
      return targetDir
    } else if (platform === 'win32') {
      return join(targetBase, 'x86_64-pc-windows-msvc/release')
    }
    // Fallback for unsupported dev platforms
    return null
  }
  return join(process.resourcesPath, 'binaries')
}
