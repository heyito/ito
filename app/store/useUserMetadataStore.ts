import { create } from 'zustand'
import { useAuthStore } from './useAuthStore'
import type { UserMetadata } from '../../lib/main/sqlite/models'
import { PaidStatus } from '../../lib/main/sqlite/models'

interface UserMetadataStore {
  metadata: UserMetadata | null
  isLoading: boolean
  loadMetadata: () => Promise<void>
  updateMetadata: (
    updates: Partial<Omit<UserMetadata, 'id' | 'user_id' | 'created_at'>>,
  ) => Promise<void>
  setPaidStatus: (status: PaidStatus) => Promise<void>
  setFreeWords: (count: number | null) => Promise<void>
  setProTrialStartDate: (date: Date | null) => Promise<void>
  setProTrialEndDate: (date: Date | null) => Promise<void>
  setProSubscriptionStartDate: (date: Date | null) => Promise<void>
  setProSubscriptionEndDate: (date: Date | null) => Promise<void>
}

// Default state for new free users
const DEFAULT_METADATA = {
  paid_status: PaidStatus.FREE,
  free_words_remaining: 4000,
  pro_trial_start_date: null,
  pro_trial_end_date: null,
  pro_subscription_start_date: null,
  pro_subscription_end_date: null,
}

export const useUserMetadataStore = create<UserMetadataStore>((set, get) => ({
  metadata: null,
  isLoading: false,

  loadMetadata: async () => {
    try {
      set({ isLoading: true })
      const metadata = await window.api.userMetadata.get()

      // If no metadata exists for this user, create default
      if (!metadata) {
        const { user } = useAuthStore.getState()
        if (!user?.id) return

        const now = new Date()
        const newMetadata: UserMetadata = {
          id: crypto.randomUUID(),
          user_id: user.id,
          ...DEFAULT_METADATA,
          created_at: now,
          updated_at: now,
        }

        await window.api.userMetadata.upsert(newMetadata)
        set({ metadata: newMetadata, isLoading: false })
      } else {
        set({ metadata, isLoading: false })
      }
    } catch (error) {
      console.error('Failed to load user metadata from database:', error)
      set({ isLoading: false })
    }
  },

  updateMetadata: async updates => {
    try {
      await window.api.userMetadata.update(updates)
      await get().loadMetadata() // Reload to get fresh data
    } catch (error) {
      console.error('Failed to update user metadata:', error)
      throw error
    }
  },

  setPaidStatus: async (status: PaidStatus) => {
    await get().updateMetadata({ paid_status: status })
  },

  setFreeWords: async (count: number | null) => {
    await get().updateMetadata({ free_words_remaining: count })
  },

  setProTrialStartDate: async (date: Date | null) => {
    await get().updateMetadata({ pro_trial_start_date: date })
  },

  setProTrialEndDate: async (date: Date | null) => {
    await get().updateMetadata({ pro_trial_end_date: date })
  },

  setProSubscriptionStartDate: async (date: Date | null) => {
    await get().updateMetadata({ pro_subscription_start_date: date })
  },

  setProSubscriptionEndDate: async (date: Date | null) => {
    await get().updateMetadata({ pro_subscription_end_date: date })
  },
}))
