import { app, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { audioRecorderService } from '../media/audio'
import store, { SettingsStore } from './store'
import { STORE_KEYS } from '../constants/store-keys'
import { createAppWindow, mainWindow } from './app'
import { voiceInputService } from './voiceInputService'

let tray: Tray | null = null
const TRAY_GUID = '7c6b7a2e-0d7e-4a4a-9d3d-2a3d9b6f2b10' // This is a GUID for the tray icon, ensures that the icon maintains position across restarts
const TRAY_HEIGHT = 16

function getTrayIconPath(): string {
  // Use the repo resource path in dev and the app resources path in prod
  if (!app.isPackaged) {
    return join(__dirname, '../../resources/build/ito-logo.png')
  }
  return join(process.resourcesPath, 'build', 'ito-logo.png')
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

  const iconPath = getTrayIconPath()

  let image = nativeImage.createFromPath(iconPath)

  if (image.isEmpty() && process.platform === 'darwin') {
    image = nativeImage.createFromNamedImage('NSImageNameStatusAvailable')
  }

  const trayImage = image.resize({ height: TRAY_HEIGHT })

  tray = new Tray(trayImage, TRAY_GUID)
  tray.setToolTip('Ito')

  await rebuildTrayMenu()

  // For Windows, manually pop the menu. On macOS, rely on native menu so the icon stays highlighted.
  if (process.platform !== 'darwin') {
    tray.on('click', async () => {
      await rebuildTrayMenu()
      tray?.popUpContextMenu()
    })

    tray.on('right-click', async () => {
      await rebuildTrayMenu()
      tray?.popUpContextMenu()
    })
  }
}

export function destroyAppTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
