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
  // Auth methods
  generateNewAuthState: () => ipcRenderer.invoke('generate-new-auth-state'),
}

export default api
