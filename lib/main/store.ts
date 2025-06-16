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
  microphoneDeviceId: string
  keyboardShortcut: string[]
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
      microphoneDeviceId: 'default',
      keyboardShortcut: ['fn'],
    },
    main: {
      navExpanded: true,
    },
  },
})

export default store
