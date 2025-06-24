import React, { useState } from 'react'
import { useSettingsStore } from '../../../../store/useSettingsStore'
import { useNotesStore } from '../../../../store/useNotesStore'
import { useDictionaryStore } from '../../../../store/useDictionaryStore'
import { useOnboardingStore } from '../../../../store/useOnboardingStore'
import { Button } from '../../../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../ui/dialog'

export default function AccountSettingsContent() {
  const { firstName, lastName, email, setFirstName, setLastName } =
    useSettingsStore()
  const { loadNotes } = useNotesStore()
  const { loadEntries } = useDictionaryStore()
  const { resetOnboarding } = useOnboardingStore()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const handleDeleteAccount = () => {
    // Clear all electron store data
    window.electron.store.set('settings', {})
    window.electron.store.set('main', {})
    window.electron.store.set('notes', [])
    window.electron.store.set('dictionary', [])
    window.electron.store.set('onboarding', {})

    // Reset all stores to their initial state
    resetOnboarding()
    loadNotes()
    loadEntries()

    // Close the dialog
    setShowDeleteDialog(false)

    // Reset settings by reloading the page or triggering a full app restart
    window.location.reload()
  }

  return (
    <div className="h-full justify-between">
      <div className="space-y-6">
        {/* First name */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-900">
            First name
          </label>
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="w-80 bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Last name */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-900">Last name</label>
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className="w-80 bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Email */}
        <div className="flex items-center justify-between py-3 my-1">
          <label className="text-sm font-medium text-gray-900">Email</label>
          <div className="w-80 text-sm text-gray-600 px-4">{email}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex pt-8 w-full justify-center">
        <Button
          variant="outline"
          size="lg"
          className="px-6 py-3 bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
        >
          Sign out
        </Button>
      </div>
      <div className="flex pt-12 w-full justify-center">
        <Button
          variant="ghost"
          size="lg"
          onClick={() => setShowDeleteDialog(true)}
          className="px-6 py-3 text-red-400 hover:text-red-200"
        >
          Delete account
        </Button>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Account</DialogTitle>
            <DialogDescription className="text-gray-600">
              Are you absolutely sure you want to delete your account? This
              action cannot be undone and will permanently remove:
              <br />
              <br />
              • All your personal information
              <br />
              • All saved notes
              <br />
              • All dictionary entries
              <br />
              • All app settings and preferences
              <br />
              <br />
              This will reset Ito to its initial state.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount}>
              Yes, delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
