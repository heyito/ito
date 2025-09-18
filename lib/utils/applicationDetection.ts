import { getActiveWindow } from '../media/active-application'

const TERMINAL_APPS = new Set([
  // macOS terminals
  'terminal',
  'iterm2',
  'iterm',
  'alacritty',
  'kitty',
  'hyper',
  'warp',
  'wezterm',
  'tabby',
  'rio',
  'console',
  'xterm',

  // Windows terminals
  'windows terminal',
  'command prompt',
  'powershell',
  'windows powershell',
  'git bash',
  'msys2',
  'cygwin',
  'ubuntu', // WSL Ubuntu
  'debian', // WSL Debian
  'kali', // WSL Kali

  // IDEs with integrated terminals (cross-platform)
  'visual studio code',
  'code',
  'visual studio',
  'intellij idea',
  'webstorm',
  'pycharm',
  'clion',
  'phpstorm',
  'rubymine',
  'goland',
  'datagrip',
  'rider',
  'android studio',
  'neovim',
  'vim',
  'emacs',

  // Linux terminals
  'gnome-terminal',
  'konsole',
  'xfce4-terminal',
  'mate-terminal',
  'lxterminal',
  'terminator',
  'tilix',
  'guake',
  'yakuake',
])

export function isTerminalApplication(appName: string): boolean {
  const lowerAppName = appName.toLowerCase()
  return Array.from(TERMINAL_APPS).some(termApp =>
    lowerAppName.includes(termApp),
  )
}

export async function canGetContextFromCurrentApp(): Promise<boolean> {
  try {
    const window = await getActiveWindow()
    console.log('Active window:', window)
    if (!window?.appName) {
      return false // Default to disallowing context if we can't determine
    }
    return !isTerminalApplication(window.appName)
  } catch (error) {
    console.error('Failed to get active window:', error)
    return false // Default to not allowing context on error
  }
}
