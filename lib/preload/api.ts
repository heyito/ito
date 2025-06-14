import { ipcRenderer } from 'electron'

const api = {
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args)
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
  onKeyEvent: (callback: (event: any) => void) => {
    console.log('Setting up key event listener in preload')
    // Remove any existing listeners to prevent duplicates
    ipcRenderer.removeAllListeners('key-event')
    // Add the new listener
    const handler = (_: any, event: any) => {
      console.log('Received key event in preload:', event)
      try {
        callback(event)
      } catch (error) {
        console.error('Error in key event callback:', error)
      }
    }
    ipcRenderer.on('key-event', handler)
    console.log('Key event listener set up in preload')
    // Return cleanup function
    return () => {
      console.log('Cleaning up key event listener in preload')
      ipcRenderer.removeListener('key-event', handler)
    }
  },
}

export default api
