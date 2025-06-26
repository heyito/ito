import { IpcRendererEvent, ipcRenderer } from 'electron'

const api = {
  /**
   * Sends a one-way message to the main process.
   * @param channel The channel name to send the message on.
   * @param data The data to send.
   */
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args)
  },
  /**
   * Subscribe to an event, and return a cleanup function.
   * @param channel The event channel to subscribe to.
   * @param callback The callback to execute when the event is triggered.
   * @returns A cleanup function to unsubscribe.
   */
  on: (channel: string, callback: (...args: any[]) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, ...args: any[]) => {
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
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
  // Key listener methods
  startKeyListener: () => ipcRenderer.invoke('start-key-listener-service'),
  stopKeyListener: () => ipcRenderer.invoke('stop-key-listener'),
  startNativeRecording: () => ipcRenderer.invoke('start-native-recording'),
  stopNativeRecording: () => ipcRenderer.invoke('stop-native-recording'),
  getNativeAudioDevices: () => ipcRenderer.invoke('get-native-audio-devices'),
  onVolumeUpdate: (callback: (volume: number) => void) => {
    const handler = (_: any, volume: number) => callback(volume);
    ipcRenderer.on('volume-update', handler);
    return () => ipcRenderer.removeListener('volume-update', handler);
  },
  blockKeys: (keys: string[]) => ipcRenderer.invoke('block-keys', keys),
  unblockKey: (key: string) => ipcRenderer.invoke('unblock-key', key),
  getBlockedKeys: () => ipcRenderer.invoke('get-blocked-keys'),
  onKeyEvent: (callback: (event: any) => void) => {
    const handler = (_: any, event: any) => callback(event)
    ipcRenderer.on('key-event', handler)
    return () => ipcRenderer.removeListener('key-event', handler)
  },
  // Auth methods
  generateNewAuthState: () => ipcRenderer.invoke('generate-new-auth-state'),
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
  'check-accessibility-permission': (prompt: boolean) =>
    ipcRenderer.invoke('check-accessibility-permission', prompt),
  'check-microphone-permission': (prompt: boolean) =>
    ipcRenderer.invoke('check-microphone-permission', prompt),
  'start-native-recording': (deviceId: string) => ipcRenderer.send('start-native-recording', deviceId),
  'stop-native-recording': () => ipcRenderer.send('stop-native-recording'),
  dev: {
    revertLastMigration: () => ipcRenderer.invoke('dev:revert-last-migration'),
    wipeDatabase: () => ipcRenderer.invoke('dev:wipe-database'),
  },
  notes: {
    getAll: () => ipcRenderer.invoke('notes:get-all'),
    add: (note: any) => ipcRenderer.invoke('notes:add', note),
    updateContent: (id: string, content: string) =>
      ipcRenderer.invoke('notes:update-content', { id, content }),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
  },
  dictionary: {
    getAll: () => ipcRenderer.invoke('dictionary:get-all'),
    add: (item: any) => ipcRenderer.invoke('dictionary:add', item),
    update: (id: string, word: string, pronunciation: string | null) =>
      ipcRenderer.invoke('dictionary:update', { id, word, pronunciation }),
    delete: (id: string) => ipcRenderer.invoke('dictionary:delete', id),
  },
}

export default api
