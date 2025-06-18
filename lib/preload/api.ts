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
    // Remove any existing listeners to prevent duplicates
    ipcRenderer.removeAllListeners('key-event')
    // Add the new listener
    const handler = (_: any, event: any) => {
      try {
        // Validate event object before calling callback
        if (!event || typeof event !== 'object') {
          console.warn('Received invalid key event:', event)
          return
        }
        if (!event.type || !event.key) {
          console.warn('Key event missing required properties:', event)
          return
        }
        callback(event)
      } catch (error) {
        console.error('Error in key event callback:', error)
      }
    }
    ipcRenderer.on('key-event', handler)
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('key-event', handler)
    }
  },
}

export default api
