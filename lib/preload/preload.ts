import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import api from './api'
import * as log from 'electron-log/renderer'

// Override the console object in the renderer process
Object.assign(console, log.functions)

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      ...electronAPI,
      store: {
        get(key) {
          return ipcRenderer.sendSync('electron-store-get', key)
        },
        set(property, val) {
          ipcRenderer.send('electron-store-set', property, val)
        },
      },
    })
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // In non-context-isolated environments, we need to manually
  // construct the same object that contextBridge would create.
  window.electron = {
    ...electronAPI,
    store: {
      get(key) {
        return ipcRenderer.sendSync('electron-store-get', key)
      },
      set(property, val) {
        ipcRenderer.send('electron-store-set', property, val)
      },
    },
  }
  window.api = api
}
