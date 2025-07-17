/// <reference types="electron-vite/node" />

declare module '*.css' {
  const content: string
  export default content
}

declare module '*.png' {
  const content: string
  export default content
}

declare module '*.jpg' {
  const content: string
  export default content
}

declare module '*.jpeg' {
  const content: string
  export default content
}

declare module '*.svg' {
  const content: string
  export default content
}

declare module '*.webm' {
  const content: string
  export default content
}

declare module '*.web' {
  const content: string
  export default content
}

// Augment the Window interface
declare global {
  interface Window {
    api: IpcApi
  }
}

export interface IpcApi {
  generateNewAuthState: () => Promise<any>
  invoke: (channel: string, ...args: any[]) => Promise<any>
  on: (
    channel: string,
    listener: (event: any, ...args: any[]) => void,
  ) => () => void // Returns a cleanup function
  send: (channel: string, ...args: any[]) => void
  getNativeAudioDevices: () => Promise<any>
  notifyLoginSuccess: (
    profile: any,
    idToken: string,
    accessToken: string,
  ) => void
  deleteUserData: () => Promise<void>
}
