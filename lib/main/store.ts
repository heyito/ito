import Store from 'electron-store'

interface MainStore {
  navExpanded: boolean
}

interface OnboardingStore {
  onboardingStep: number
  onboardingCompleted: boolean
}

interface SettingsStore {
  shareAnalytics: boolean
  launchAtLogin: boolean
  showItoBarAlways: boolean
  showAppInDock: boolean
  interactionSounds: boolean
  muteAudioWhenDictating: boolean
  microphoneDeviceId: string
  microphoneName: string
  keyboardShortcut: string[]
  firstName: string
  lastName: string
  email: string
}

interface AppStore {
  main: MainStore
  onboarding: OnboardingStore
  settings: SettingsStore
}

const store = new Store<AppStore>({
  defaults: {
    onboarding: {
      onboardingStep: 0,
      onboardingCompleted: false,
    },
    settings: {
      shareAnalytics: true,
      launchAtLogin: true,
      showItoBarAlways: true,
      showAppInDock: true,
      interactionSounds: true,
      muteAudioWhenDictating: false,
      microphoneDeviceId: 'default',
      microphoneName: 'Auto-detect',
      keyboardShortcut: ['fn'],
      firstName: '',
      lastName: '',
      email: '',
    },
    main: {
      navExpanded: true,
    },
  },
})

export default store
