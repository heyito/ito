import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Pencil, Trash, Plus } from '@mynaui/icons-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip'
import { Switch } from '../../ui/switch'
import { useDictionaryStore } from '../../../store/useDictionaryStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../ui/dialog'
import { Button } from '../../ui/button'

export default function DictionaryContent() {
  const {
    entries,
    loadEntries,
    addEntry,
    addReplacement,
    updateEntry,
    deleteEntry,
  } = useDictionaryStore()
  const [showScrollToTop, setShowScrollToTop] = useState(false)
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [editingEntry, setEditingEntry] = useState<{
    id: string
    type: 'normal' | 'replacement'
    content?: string
    from?: string
    to?: string
  } | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editFrom, setEditFrom] = useState('')
  const [editTo, setEditTo] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newEntryContent, setNewEntryContent] = useState('')
  const [newFrom, setNewFrom] = useState('')
  const [newTo, setNewTo] = useState('')
  const [isReplacement, setIsReplacement] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const editFromRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const addFromRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

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
  }, [])

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }
  }

  const getDisplayText = (entry: (typeof entries)[0]) => {
    if (entry.type === 'replacement') {
      return `${entry.from} → ${entry.to}`
    }
    return entry.content
  }

  const handleEdit = (id: string) => {
    const entry = entries.find(e => e.id === id)
    if (entry) {
      if (entry.type === 'normal') {
        setEditingEntry({ id, type: 'normal', content: entry.content })
        setEditContent(entry.content)
        setEditFrom('')
        setEditTo('')
        // Focus the input after the dialog opens
        setTimeout(() => {
          editInputRef.current?.focus()
        }, 100)
      } else {
        setEditingEntry({
          id,
          type: 'replacement',
          from: entry.from,
          to: entry.to,
        })
        setEditContent('')
        setEditFrom(entry.from)
        setEditTo(entry.to)
        // Focus the first input after the dialog opens
        setTimeout(() => {
          editFromRef.current?.focus()
        }, 100)
      }
    }
  }

  const handleSaveEdit = () => {
    if (!editingEntry) return

    if (editingEntry.type === 'normal' && editContent.trim() !== '') {
      updateEntry(editingEntry.id, {
        type: 'normal',
        content: editContent.trim(),
      } as any)
      setEditingEntry(null)
      setEditContent('')
    } else if (
      editingEntry.type === 'replacement' &&
      editFrom.trim() !== '' &&
      editTo.trim() !== ''
    ) {
      updateEntry(editingEntry.id, {
        type: 'replacement',
        from: editFrom.trim(),
        to: editTo.trim(),
      } as any)
      setEditingEntry(null)
      setEditFrom('')
      setEditTo('')
    }
  }

  const handleCancelEdit = () => {
    setEditingEntry(null)
    setEditContent('')
    setEditFrom('')
    setEditTo('')
  }

  const handleDelete = (id: string) => {
    deleteEntry(id)
  }

  const handleAddNew = () => {
    setShowAddDialog(true)
    setNewEntryContent('')
    setNewFrom('')
    setNewTo('')
    setIsReplacement(false)
    // Focus the input after the dialog opens
    setTimeout(() => {
      addInputRef.current?.focus()
    }, 100)
  }

  const handleSaveNew = () => {
    if (isReplacement) {
      if (newFrom.trim() !== '' && newTo.trim() !== '') {
        addReplacement(newFrom.trim(), newTo.trim())
        setShowAddDialog(false)
        setNewFrom('')
        setNewTo('')
      }
    } else {
      if (newEntryContent.trim() !== '') {
        addEntry(newEntryContent.trim())
        setShowAddDialog(false)
        setNewEntryContent('')
      }
    }
  }

  const handleCancelNew = () => {
    setShowAddDialog(false)
    setNewEntryContent('')
    setNewFrom('')
    setNewTo('')
    setIsReplacement(false)
  }

  const handleReplacementToggle = (checked: boolean) => {
    setIsReplacement(checked)
    // Focus appropriate input when toggling
    setTimeout(() => {
      if (checked) {
        addFromRef.current?.focus()
      } else {
        addInputRef.current?.focus()
      }
    }, 100)
  }

  // Handle keyboard shortcuts in dialogs
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveNew()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelNew()
    }
  }

  const noEntries = entries.length === 0

  return (
    <div
      ref={containerRef}
      className="w-full px-36 max-h-160 overflow-y-auto relative"
      style={{
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
      }}
    >
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-medium">Dictionary</h1>
        <button
          onClick={handleAddNew}
          className="bg-gray-900 text-white px-4 py-2 rounded-md font-semibold hover:bg-gray-800 cursor-pointer flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add new
        </button>
      </div>

      <div className="w-full h-[1px] bg-slate-200 my-10"></div>
      {noEntries && (
        <div className="text-gray-500">
          <p className="text-sm">No entries yet</p>
          <p className="text-xs mt-1">
            Dictionary entries make the transcription more accurate
          </p>
        </div>
      )}
      {!noEntries && (
        <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-200">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className="flex items-center justify-between px-4 py-4 gap-10 hover:bg-gray-50 transition-colors duration-200 group"
              onMouseEnter={() => setHoveredRow(index)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              <div className="text-gray-900 flex-1">
                {getDisplayText(entry)}
              </div>

              {/* Action Icons - shown on hover */}
              <div
                className={`flex items-center gap-2 transition-opacity duration-200 ${
                  hoveredRow === index ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleEdit(entry.id)}
                      className="p-1.5 hover:bg-gray-200 rounded transition-colors cursor-pointer"
                      aria-label="Edit entry"
                    >
                      <Pencil className="w-4 h-4 text-gray-600" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={5}>
                    Edit
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-1.5 hover:bg-red-100 rounded transition-colors cursor-pointer"
                      aria-label="Delete entry"
                    >
                      <Trash className="w-4 h-4 text-gray-600 hover:text-red-600" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={5}>
                    Delete
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}

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

      {/* Edit Entry Dialog */}
      <Dialog
        open={!!editingEntry}
        onOpenChange={open => !open && handleCancelEdit()}
      >
        <DialogContent
          className="!border-0 shadow-lg p-0"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="sr-only">
              {editingEntry?.type === 'replacement'
                ? 'Edit replacement'
                : 'Edit Dictionary Entry'}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6">
            <h2 className="text-lg font-semibold mb-4">
              {editingEntry?.type === 'replacement'
                ? 'Edit replacement'
                : 'Edit entry'}
            </h2>

            {editingEntry?.type === 'normal' ? (
              <input
                ref={editInputRef}
                type="text"
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="w-full p-4 rounded-md resize-none focus:outline-none border border-neutral-200"
                placeholder="Enter dictionary entry..."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    ref={editFromRef}
                    type="text"
                    value={editFrom}
                    onChange={e => setEditFrom(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    className="flex-1 p-4 rounded-md resize-none focus:outline-none border border-neutral-200"
                    placeholder="Misspelling"
                  />
                  <span className="text-gray-500">→</span>
                  <input
                    type="text"
                    value={editTo}
                    onChange={e => setEditTo(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    className="flex-1 p-4 rounded-md resize-none focus:outline-none border border-neutral-200"
                    placeholder="Correct spelling"
                  />
                </div>
              </div>
            )}
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
              disabled={
                editingEntry?.type === 'normal'
                  ? !editContent.trim()
                  : !editFrom.trim() || !editTo.trim()
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Entry Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={open => !open && handleCancelNew()}
      >
        <DialogContent
          className="!border-0 shadow-lg p-0"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="sr-only">Add to vocabulary</DialogTitle>
          </DialogHeader>
          <div className="px-6">
            <h2 className="text-lg font-semibold mb-4">Add to vocabulary</h2>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">Make it a replacement</span>
              <Switch
                checked={isReplacement}
                onCheckedChange={handleReplacementToggle}
              />
            </div>

            {!isReplacement ? (
              <input
                ref={addInputRef}
                type="text"
                value={newEntryContent}
                onChange={e => setNewEntryContent(e.target.value)}
                onKeyDown={handleAddKeyDown}
                className="w-full p-4 rounded-md resize-none focus:outline-none border border-neutral-200"
                placeholder="Enter dictionary entry..."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    ref={addFromRef}
                    type="text"
                    value={newFrom}
                    onChange={e => setNewFrom(e.target.value)}
                    onKeyDown={handleAddKeyDown}
                    className="flex-1 p-4 rounded-md resize-none focus:outline-none border border-neutral-200"
                    placeholder="Misspelling"
                  />
                  <span className="text-gray-500">→</span>
                  <input
                    type="text"
                    value={newTo}
                    onChange={e => setNewTo(e.target.value)}
                    onKeyDown={handleAddKeyDown}
                    className="flex-1 p-4 rounded-md resize-none focus:outline-none border border-neutral-200"
                    placeholder="Correct spelling"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="p-4">
            <Button
              className="bg-neutral-200 hover:bg-neutral-300 text-black cursor-pointer"
              onClick={handleCancelNew}
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              onClick={handleSaveNew}
              disabled={
                isReplacement
                  ? !newFrom.trim() || !newTo.trim()
                  : !newEntryContent.trim()
              }
            >
              Add word
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
