import { app, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { audioRecorderService } from '../media/audio'
import store, { SettingsStore } from './store'
import { STORE_KEYS } from '../constants/store-keys'
import { createAppWindow, mainWindow } from './app'
import { voiceInputService } from './voiceInputService'

let tray: Tray | null = null

function getTrayIconPath(): string {
  // Use the repo resource path in dev and the app resources path in prod
  if (!app.isPackaged) {
    return join(__dirname, '../../resources/build/icon.png')
  }
  return join(process.resourcesPath, 'build', 'icon.png')
}

async function buildMicrophoneSubmenu(): Promise<
  Electron.MenuItemConstructorOptions[]
> {
  const settings = store.get(STORE_KEYS.SETTINGS) as SettingsStore
  const currentDeviceId = settings.microphoneDeviceId

  let devices: string[] = []
  try {
    devices = await audioRecorderService.getDeviceList()
  } catch {
    devices = []
  }

  const onSelect = (deviceId: string, label: string) => {
    const prev = store.get(STORE_KEYS.SETTINGS) as SettingsStore
    const updated: SettingsStore = {
      ...prev,
      microphoneDeviceId: deviceId,
      microphoneName: label,
    }
    store.set(STORE_KEYS.SETTINGS, updated)
    voiceInputService.handleMicrophoneChanged(deviceId)
    // Rebuild the context menu to update the checked item
    void rebuildTrayMenu()
  }

  const items: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Auto-detect',
      type: 'radio',
      checked: currentDeviceId === 'default',
      click: () => onSelect('default', 'Auto-detect'),
    },
  ]

  for (const deviceName of devices) {
    items.push({
      label: deviceName,
      type: 'radio',
      checked: currentDeviceId === deviceName,
      click: () => onSelect(deviceName, deviceName),
    })
  }

  items.push({ type: 'separator' })
  items.push({
    label: 'Refresh devices',
    click: () => {
      void rebuildTrayMenu()
    },
  })

  return items
}

async function rebuildTrayMenu(): Promise<void> {
  if (!tray) return

  const micSubmenu = await buildMicrophoneSubmenu()

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Open Dashboard',
      click: () => {
        if (!mainWindow) {
          createAppWindow()
        } else {
          if (!mainWindow.isVisible()) mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    {
      label: 'Select Microphone',
      submenu: micSubmenu,
    },
    { type: 'separator' },
    {
      label: 'Quit Ito',
      role: 'quit',
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  tray.setContextMenu(menu)
}

export async function createAppTray(): Promise<void> {
  if (tray) return

  const image = nativeImage.createFromPath(getTrayIconPath())
  if (process.platform === 'darwin') {
    image.setTemplateImage(true)
  }

  tray = new Tray(image)
  tray.setToolTip('Ito')

  await rebuildTrayMenu()

  // On macOS, left-click should also show the menu for convenience
  tray.on('click', async () => {
    await rebuildTrayMenu()
    tray?.popUpContextMenu()
  })

  tray.on('right-click', async () => {
    await rebuildTrayMenu()
    tray?.popUpContextMenu()
  })
}

export function destroyAppTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
