import { useEffect } from 'react'
import { useNotesStore } from '../../../store/useNotesStore'
import Masonry from '@mui/lab/Masonry'

export default function NotesContent() {
  const { notes, loadNotes, addNote } = useNotesStore()

  useEffect(() => {
    // Load notes on component mount
    loadNotes()
    
    // Add some sample notes if none exist
    if (notes.length === 0) {
      addNote("Here sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long note")
      addNote("Here sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long...")
      addNote("Here sa super long noteHere sa super long note")
      addNote("Here sa super long note Here sa super long note Here sa super long noteHere sa super long note Here sa super long noteHere sa super long noteHere sa super long note Here sa super long noteHere sa super long noteHere sa super long...")
      addNote("a note")
      addNote("Here sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long...")
      addNote("Here sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long note")
      addNote("Here sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long...")
      addNote("Here sa super long noteHere sa super long note")
      addNote("Here sa super long note Here sa super long note Here sa super long noteHere sa super long note Here sa super long noteHere sa super long noteHere sa super long note Here sa super long noteHere sa super long noteHere sa super long...")
      addNote("a note")
      addNote("Here sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long noteHere sa super long...")

    }
  }, [loadNotes, addNote, notes.length])

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  const formatTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) {
      return content
    }
    return content.slice(0, maxLength) + '...'
  }

  return (
    <div 
      className="w-full max-w-6xl mx-auto px-4 h-200 overflow-y-auto" 
      style={{ 
        height: '640px',
        msOverflowStyle: 'none',  /* Internet Explorer 10+ */
        scrollbarWidth: 'none'    /* Firefox */
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-medium text-gray-900 w-full text-center">What's on your mind today?</h1>
      </div>

      {/* Text Input Area */}
      <div className="shadow-lg rounded-2xl mb-8 border border-gray-200 w-2/3 mx-auto h-32">
        <textarea
          placeholder="Take a quick note with your voice"
          className="w-full h-full p-4 focus:outline-none"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            All Notes
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Search">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="List view">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
        {/* Notes Masonry Layout */}
        {notes.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg">No notes yet</p>
            <p className="text-sm mt-1">Create your first note using voice input</p>
          </div>
        ) : (
          <div className="p-4">
            <Masonry columns={{ xs: 1, sm: 2, md: 3 }} spacing={2}>
              {notes.map((note, index) => (
                <div 
                  key={index}
                  className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
                >
                  <div className="flex flex-col">
                    <div className="mb-4">
                      <div className="text-gray-900 font-medium text-sm leading-relaxed break-words">
                        {truncateContent(note.content)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-gray-400 text-sm mt-auto">
                      <span className="font-medium">{formatDate(note.createdAt)}</span>
                      <span>{formatTime(note.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </Masonry>
          </div>
        )}
      </div>
    </div>
  )
} 