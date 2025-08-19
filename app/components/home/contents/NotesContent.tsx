import { useEffect, useRef, useState } from 'react'
import { useNotesStore } from '../../../store/useNotesStore'
import { useSettingsStore } from '../../../store/useSettingsStore'
import Masonry from '@mui/lab/Masonry'
import { AudioIcon } from '../../icons/AudioIcon'
import { ArrowUp, Grid, Rows, Search, X } from '@mynaui/icons-react'
import { Note } from '../../ui/note'
import { StatusIndicator } from '../../ui/status-indicator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../ui/dialog'
import { Button } from '../../ui/button'
import { ItoMode } from '@/app/generated/ito_pb'

export default function NotesContent() {
  const { notes, loadNotes, addNote, deleteNote, updateNote } = useNotesStore()
  const { getItoModeShortcuts } = useSettingsStore()
  const keyboardShortcut = getItoModeShortcuts(ItoMode.TRANSCRIBE)[0].keys
  const [creatingNote, setCreatingNote] = useState(false)
  const [showAddNoteButton, setShowAddNoteButton] = useState(false)
  const [noteContent, setNoteContent] = useState('')
  const [showScrollToTop, setShowScrollToTop] = useState(false)
  const [containerHeight, setContainerHeight] = useState(128) // 128px = h-32
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState<number | null>(null)
  const [statusIndicator, setStatusIndicator] = useState<
    'success' | 'error' | null
  >(null)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [editingNote, setEditingNote] = useState<{
    id: string
    content: string
  } | null>(null)
  const [editContent, setEditContent] = useState('')
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadNotes()
  }, [loadNotes, addNote, notes.length])

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const formatTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) {
      return content
    }
    return content.slice(0, maxLength) + '...'
  }

  const handleBlur = () => {
    // If the note isn't empty, don't close the input
    setTimeout(() => {
      if (textareaRef.current?.value.trim() === '') {
        setCreatingNote(false)
      }
    }, 200)
  }

  const updateNoteContent = (content: string) => {
    setNoteContent(content)
    if (content.trim() !== '') {
      setShowAddNoteButton(true)
    } else {
      setShowAddNoteButton(false)
    }

    // Auto-resize textarea and container
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const scrollHeight = textareaRef.current.scrollHeight
      textareaRef.current.style.height = `${scrollHeight}px`

      // Calculate container height: textarea height + padding + button space
      const minHeight = 192 // min-h-48 = 192px
      const paddingAndButton = 48 + 40 // 48px padding + 40px for button space
      const newContainerHeight = Math.max(
        minHeight,
        scrollHeight + paddingAndButton,
      )
      setContainerHeight(newContainerHeight)
    }
  }

  const toggleViewMode = () => {
    setViewMode(viewMode === 'grid' ? 'list' : 'grid')
  }

  const openSearch = () => {
    setShowSearch(true)
    // Focus the search input after the component updates
    setTimeout(() => {
      searchInputRef.current?.focus()
    }, 100)
  }

  const closeSearch = () => {
    setShowSearch(false)
    setSearchQuery('')
  }

  // Filter notes based on search query
  const filteredNotes =
    searchQuery.trim() === ''
      ? notes
      : notes.filter(note =>
          note.content.toLowerCase().includes(searchQuery.toLowerCase()),
        )

  const handleAddNote = async () => {
    if (noteContent.trim() !== '') {
      try {
        await addNote(noteContent.trim())
        setNoteContent('')
        setCreatingNote(false)
        setShowAddNoteButton(false)
        setStatusMessage('Note saved')
        setStatusIndicator('success')
      } catch (error) {
        console.error('Failed to add note:', error)
        setStatusMessage('Failed to save note')
        setStatusIndicator('error')
      }
    }
  }

  const handleCopyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setShowDropdown(null)
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId)
      setShowDropdown(null)
      setStatusMessage('Deleted note')
      setStatusIndicator('success')
    } catch (error) {
      console.error('Failed to delete note:', error)
      setStatusMessage('Failed to delete note')
      setStatusIndicator('error')
    }
  }

  const handleEditNote = (noteId: string) => {
    const note = notes.find(n => n.id === noteId)
    if (note) {
      setEditingNote({ id: noteId, content: note.content })
      setEditContent(note.content)
      setShowDropdown(null)
      // Focus the textarea after the dialog opens
      setTimeout(() => {
        editTextareaRef.current?.focus()
      }, 100)
    }
  }

  const handleSaveEdit = async () => {
    if (editingNote && editContent.trim() !== '') {
      try {
        await updateNote(editingNote.id, editContent.trim())
        setEditingNote(null)
        setEditContent('')
        setStatusMessage('Updated note')
        setStatusIndicator('success')
      } catch (error) {
        console.error('Failed to update note:', error)
        setStatusMessage('Failed to update note')
        setStatusIndicator('error')
      }
    }
  }

  const handleCancelEdit = () => {
    setEditingNote(null)
    setEditContent('')
  }

  // Handle keyboard shortcuts in edit dialog
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  const toggleDropdown = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDropdown(showDropdown === index ? null : index)
  }

  // Auto-resize on mount and when creatingNote changes
  useEffect(() => {
    if (creatingNote && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const scrollHeight = textareaRef.current.scrollHeight
      textareaRef.current.style.height = `${scrollHeight}px`

      // Set container height for creating state
      const minHeight = 192 // min-h-48 = 192px
      const paddingAndButton = 48 // 48px padding for button space
      const newContainerHeight = Math.max(
        minHeight,
        scrollHeight + paddingAndButton,
      )
      setContainerHeight(newContainerHeight)
    } else if (!creatingNote) {
      // Reset to default height when not creating
      setContainerHeight(128) // h-32 = 128px
      if (textareaRef.current) {
        textareaRef.current.style.height = ''
      }
    }
  }, [creatingNote])

  // Handle scroll events
  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        const scrollTop = containerRef.current.scrollTop
        setShowScrollToTop(scrollTop > 200) // Show button after scrolling 200px
      }
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }

    return () => {}
  }, [])

  // Handle escape key for closing search
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showSearch) {
        closeSearch()
      }
    }

    if (showSearch) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }

    return () => {}
  }, [showSearch])

  // Handle clicks outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = () => {
      setShowDropdown(null)
    }

    if (showDropdown !== null) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }

    return () => {}
  }, [showDropdown])

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }
  }

  return (
    <div
      ref={containerRef}
      className="w-full max-w-6xl mx-auto px-4 h-200 overflow-y-auto relative px-24"
      style={{
        height: '640px',
        msOverflowStyle: 'none' /* Internet Explorer 10+ */,
        scrollbarWidth: 'none' /* Firefox */,
      }}
    >
      {/* Header */}
      {showSearch ? (
        <div className="flex items-center gap-4 mb-8 px-4 py-2 bg-white border border-gray-200 rounded-lg">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search your notes"
            className="flex-1 text-sm outline-none placeholder-gray-400"
          />
          <button
            onClick={closeSearch}
            className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
            title="Close search"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-medium text-gray-900 w-full text-center">
            What's on your mind today?
          </h1>
        </div>
      )}

      {/* Text Input Area - Only show when not searching */}
      {!showSearch && (
        <div
          className="shadow-lg rounded-2xl mb-8 border border-gray-200 w-3/5 mx-auto transition-all duration-200 ease-in-out relative"
          style={{ height: `${containerHeight}px` }}
        >
          {!creatingNote && (
            <div className="absolute top-6 left-6 flex items-center gap-1 text-gray-500 pointer-events-none">
              <AudioIcon />
              <span>Take a quick note with your voice</span>
            </div>
          )}
          <textarea
            ref={textareaRef}
            className={`w-full pt-6 px-6 focus:outline-none resize-none overflow-hidden ${creatingNote ? 'cursor-text' : 'cursor-pointer'}`}
            value={noteContent}
            onChange={e => updateNoteContent(e.target.value)}
            onClick={() => setCreatingNote(true)}
            onBlur={handleBlur}
            placeholder={`${creatingNote ? `Press and hold ${keyboardShortcut.join(' + ')} and start speaking` : ''}`}
          />
          {showAddNoteButton && (
            <div className="absolute bottom-3 right-3">
              <button
                onClick={handleAddNote}
                className="bg-neutral-200 px-4 py-2 rounded-md font-semibold hover:bg-neutral-300 cursor-pointer"
              >
                Add note
              </button>
            </div>
          )}
        </div>
      )}
      <div
        className={`${viewMode === 'grid' || showSearch ? '' : 'm-auto w-3/5'}`}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            {showSearch
              ? `Search Results (${filteredNotes.length})`
              : `Notes (${notes.length})`}
          </div>
          <div className="flex items-center gap-1">
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              title="Search"
              onClick={openSearch}
            >
              <Search className="w-5 h-5 text-neutral-400" />
            </button>
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              title="List view"
              onClick={toggleViewMode}
            >
              {viewMode === 'grid' ? (
                <Rows className="w-5 h-5 text-neutral-400" />
              ) : (
                <Grid className="w-5 h-5 text-neutral-400" />
              )}
            </button>
          </div>
        </div>
        <div className="w-full h-[1px] bg-slate-200 mb-4"></div>
        {/* Notes Masonry Layout */}
        {(showSearch ? filteredNotes.length === 0 : notes.length === 0) ? (
          <div className="py-4 text-gray-500">
            {showSearch ? (
              <>
                <p className="text-sm">No notes found</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </>
            ) : (
              <>
                <p className="text-sm">No notes yet</p>
              </>
            )}
          </div>
        ) : (
          <div className="py-4">
            {viewMode === 'grid' && (
              <Masonry columns={{ xs: 1, sm: 2, md: 3 }} spacing={2}>
                {(showSearch ? filteredNotes : notes).map((note, index) => (
                  <Note
                    key={note.id}
                    note={note}
                    index={index}
                    showDropdown={showDropdown}
                    onEdit={handleEditNote}
                    onToggleDropdown={toggleDropdown}
                    onCopyToClipboard={handleCopyToClipboard}
                    onDeleteNote={handleDeleteNote}
                    formatDate={formatDate}
                    formatTime={formatTime}
                    truncateContent={truncateContent}
                    searchQuery={showSearch ? searchQuery : undefined}
                  />
                ))}
              </Masonry>
            )}
            {viewMode === 'list' && (
              <div className="flex flex-col gap-4">
                {(showSearch ? filteredNotes : notes).map((note, index) => (
                  <Note
                    key={note.id}
                    note={note}
                    index={index}
                    showDropdown={showDropdown}
                    onEdit={handleEditNote}
                    onToggleDropdown={toggleDropdown}
                    onCopyToClipboard={handleCopyToClipboard}
                    onDeleteNote={handleDeleteNote}
                    formatDate={formatDate}
                    formatTime={formatTime}
                    truncateContent={truncateContent}
                    searchQuery={showSearch ? searchQuery : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scroll to Top Button */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 bg-black text-white right-8 w-8 h-8 rounded-full shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex items-center justify-center group z-50 cursor-pointer"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-4 h-4 font-bold" />
        </button>
      )}

      {/* Edit Note Dialog */}
      <Dialog
        open={!!editingNote}
        onOpenChange={open => !open && handleCancelEdit()}
      >
        <DialogContent
          className="!border-0 shadow-lg p-0"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="sr-only">Edit Note</DialogTitle>
          </DialogHeader>
          <div>
            <textarea
              ref={editTextareaRef}
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full px-4 rounded-md resize-none focus:outline-none border-0"
              rows={6}
              placeholder="Edit your note..."
            />
          </div>
          <DialogFooter className="p-4">
            <Button
              className="bg-neutral-200 hover:bg-neutral-300 text-black cursor-pointer"
              onClick={handleCancelEdit}
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              onClick={handleSaveEdit}
              disabled={!editContent.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Indicator */}
      <StatusIndicator
        status={statusIndicator}
        onHide={() => {
          setStatusIndicator(null)
          setStatusMessage('')
        }}
        successMessage={statusMessage}
        errorMessage={statusMessage}
      />
    </div>
  )
}
