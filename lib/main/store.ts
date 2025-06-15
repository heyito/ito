import Store from 'electron-store'

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
  },
})

console.log('store', store.get('onboarding'))

export default store
