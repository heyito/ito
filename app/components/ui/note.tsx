import { Pencil, Copy, Trash, Dots } from '@mynaui/icons-react'
import type { Note } from '../../store/useNotesStore'

interface NoteProps {
  note: Note
  index: number
  showDropdown: number | null
  onEdit: (noteId: string) => void
  onToggleDropdown: (index: number, e: React.MouseEvent) => void
  onCopyToClipboard: (content: string) => void
  onDeleteNote: (noteId: string) => void
  formatDate: (date: Date) => string
  formatTime: (date: Date) => string
  truncateContent: (content: string, maxLength?: number) => string
}

export function Note({
  note,
  index,
  showDropdown,
  onEdit,
  onToggleDropdown,
  onCopyToClipboard,
  onDeleteNote,
  formatDate,
  formatTime,
  truncateContent
}: NoteProps) {
  return (
    <div 
      key={note.id}
      className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md group relative"
    >
      {/* Hover Icons */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:shadow-sm group-hover:opacity-100 transition-opacity duration-200 flex items-center rounded-md">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(note.id)
          }}
          className="p-1.5 hover:bg-gray-100 transition-colors border-r border-neutral-200 rounded-l-md cursor-pointer "
        >
          <Pencil className="w-4 h-4 text-neutral-500" />
        </button>
        <div className="relative">
          <button
            onClick={(e) => onToggleDropdown(index, e)}
            className="p-1.5 hover:bg-gray-100 transition-colors rounded-r-md cursor-pointer"
          >
            <Dots className="w-4 h-4 text-neutral-800" />
          </button>
          
          {/* Dropdown Menu */}
          {showDropdown === index && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCopyToClipboard(note.content)
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-t-lg cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                Copy to clipboard
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteNote(note.id)
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 rounded-b-lg cursor-pointer"
              >
                <Trash className="w-4 h-4" />
                Delete note
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col">
        <div className="mb-4 pr-16">
          <div className="text-gray-900 font-normal text-sm leading-relaxed break-words">
            {truncateContent(note.content)}
          </div>
        </div>
        <div className="flex items-center justify-between text-gray-400 text-xs mt-auto">
          <span>{formatDate(note.createdAt)}</span>
          <span>{formatTime(note.createdAt)}</span>
        </div>
      </div>
    </div>
  )
} 