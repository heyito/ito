import { ipcRenderer } from 'electron'
import { KeyEvent } from '.'

const api = {
  /**
   * Sends a one-way message to the main process.
   * @param channel The channel name to send the message on.
   * @param data The data to send.
   */
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  /**
   * Subscribes to an event from the main process.
   * @returns A cleanup function to unsubscribe.
   */
  on: (channel: string, callback: (...args: any[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: any[]) => {
      callback(...args)
    }
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },
  receive: (channel: string, func: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_, ...args) => func(...args))
  },
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
  // Key listener methods
  startKeyListener: () => ipcRenderer.invoke('start-key-listener-service'),
  stopKeyListener: () => ipcRenderer.invoke('stop-key-listener'),
  blockKeys: (keys: string[]) => ipcRenderer.invoke('block-keys', keys),
  unblockKey: (key: string) => ipcRenderer.invoke('unblock-key', key),
  getBlockedKeys: () => ipcRenderer.invoke('get-blocked-keys'),
  onKeyEvent: (callback: (event: any) => void) => {
    const handler = (_: any, event: any) => callback(event);
    ipcRenderer.on('key-event', handler);
    return () => ipcRenderer.removeListener('key-event', handler);
  },
  // All other IPC calls that the UI makes
  // These now just pass through, as the main process handles the window context
  'init-window': () => ipcRenderer.invoke('init-window'),
  'is-window-minimizable': () => ipcRenderer.invoke('is-window-minimizable'),
  'is-window-maximizable': () => ipcRenderer.invoke('is-window-maximizable'),
  'window-minimize': () => ipcRenderer.invoke('window-minimize'),
  'window-maximize': () => ipcRenderer.invoke('window-maximize'),
  'window-close': () => ipcRenderer.invoke('window-close'),
  'window-maximize-toggle': () => ipcRenderer.invoke('window-maximize-toggle'),
  'web-undo': () => ipcRenderer.invoke('web-undo'),
  'web-redo': () => ipcRenderer.invoke('web-redo'),
  'web-cut': () => ipcRenderer.invoke('web-cut'),
  'web-copy': () => ipcRenderer.invoke('web-copy'),
  'web-paste': () => ipcRenderer.invoke('web-paste'),
  'web-delete': () => ipcRenderer.invoke('web-delete'),
  'web-select-all': () => ipcRenderer.invoke('web-select-all'),
  'web-reload': () => ipcRenderer.invoke('web-reload'),
  'web-force-reload': () => ipcRenderer.invoke('web-force-reload'),
  'web-toggle-devtools': () => ipcRenderer.invoke('web-toggle-devtools'),
  'web-actual-size': () => ipcRenderer.invoke('web-actual-size'),
  'web-zoom-in': () => ipcRenderer.invoke('web-zoom-in'),
  'web-zoom-out': () => ipcRenderer.invoke('web-zoom-out'),
  'web-toggle-fullscreen': () => ipcRenderer.invoke('web-toggle-fullscreen'),
  'web-open-url': (url: string) => ipcRenderer.invoke('web-open-url', url),
  'check-accessibility-permission': (prompt: boolean) => ipcRenderer.invoke('check-accessibility-permission', prompt),
  'check-microphone-permission': (prompt: boolean) => ipcRenderer.invoke('check-microphone-permission', prompt),
}

export default api
