import { ipcRenderer } from 'electron'
import { KeyEvent } from '.'

const api = {
  /**
   * Sends a one-way message to the main process.
   * @param channel The channel name to send the message on.
   * @param data The data to send.
   */
  send: (channel: string, data: any) => {
    ipcRenderer.send(channel, data)
  },
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
  invoke: (channel: string, ...args: any[]) => {
    return ipcRenderer.invoke(channel, ...args)
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
  // Key listener methods
  startKeyListener: () => ipcRenderer.invoke('start-key-listener'),
  stopKeyListener: () => ipcRenderer.invoke('stop-key-listener'),
  blockKeys: (keys: string[]) => ipcRenderer.invoke('block-keys', keys),
  unblockKey: (key: string) => ipcRenderer.invoke('unblock-key', key),
  getBlockedKeys: () => ipcRenderer.invoke('get-blocked-keys'),
  onKeyEvent: (callback: (event: KeyEvent) => void): (() => void) => {
    // We pass just the event data, not the ipc event object
    const handler = (eventData: KeyEvent) => callback(eventData)
    return api.on('key-event', handler)
  },
}

export default api
