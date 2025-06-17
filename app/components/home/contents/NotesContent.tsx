import { useEffect, useRef, useState } from 'react'
import { useNotesStore } from '../../../store/useNotesStore'
import Masonry from '@mui/lab/Masonry'
import { AudioIcon } from '../../icons/AudioIcon'
import { ArrowUp, Rows, Search } from '@mynaui/icons-react'

export default function NotesContent() {
  const { notes, loadNotes, addNote } = useNotesStore()
  const [creatingNote, setCreatingNote] = useState(false)
  const [showAddNoteButton, setShowAddNoteButton] = useState(false)
  const [noteContent, setNoteContent] = useState('')
  const [showScrollToTop, setShowScrollToTop] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

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

  const handleBlur = () => {
    // If the note isn't empty, don't close the input
    if (textareaRef.current?.value.trim() === '') {
      setCreatingNote(false)
    }
  }

  const updateNoteContent = (content: string) => {
    setNoteContent(content)
    if (content.trim() !== '') {
      setShowAddNoteButton(true)
    } else {
      setShowAddNoteButton(false)
    }
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  const toggleViewMode = () => {
    setViewMode(viewMode === 'grid' ? 'list' : 'grid')
  }

  // Auto-resize on mount and when creatingNote changes
  useEffect(() => {
    if (creatingNote && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
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
  }, [])

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
    }
  }

  return (
    <div 
      ref={containerRef}
      className="w-full max-w-6xl mx-auto px-4 h-200 overflow-y-auto relative px-36"
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
      <div className={`shadow-lg rounded-2xl mb-8 border border-gray-200 w-3/5 mx-auto transition-all duration-200 ease-in-out relative ${creatingNote ? 'min-h-48' : 'h-32'}`}>
        {!creatingNote && (
          <div className="absolute top-6 left-6 flex items-center gap-1 text-gray-500 pointer-events-none">
            <AudioIcon />
            <span>Take a quick note with your voice</span>
          </div>
        )}
        <textarea
           ref={textareaRef}
           className={`w-full p-6 focus:outline-none resize-none overflow-hidden ${creatingNote ? 'cursor-text pb-12 min-h-48' : 'cursor-pointer h-32'}`}
           value={noteContent}
           onChange={(e) => updateNoteContent(e.target.value)}
           onClick={() => setCreatingNote(true)}
           onBlur={handleBlur}
           placeholder={`${creatingNote ? 'Press and hold fn and start speaking' : ''}`}
         />
        {showAddNoteButton && (
          <div className="absolute bottom-3 right-3">
            <button className="bg-neutral-200 px-4 py-2 rounded font-semibold hover:bg-neutral-300">Add note</button>
          </div>
        )}
      </div>
      <div className={`${viewMode === 'grid' ? '' : 'm-auto w-3/5'}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            {`All Notes (${notes.length})`}
          </div>
          <div className="flex items-center gap-1">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" title="Search">
              <Search className="w-5 h-5 text-neutral-400" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" title="List view" onClick={toggleViewMode}>
              <Rows className="w-5 h-5 text-neutral-400" />
            </button>
          </div>
        </div>
        <div className="w-full h-[1px] bg-slate-200 mb-4"></div>
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
          <div className="py-4">
            {viewMode === 'grid' && (
              <Masonry columns={{ xs: 1, sm: 2, md: 3 }} spacing={2}>
                {notes.map((note, index) => (
                  <div 
                    key={index}
                    className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
                  >
                    <div className="flex flex-col">
                      <div className="mb-4">
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
                ))}
              </Masonry>
            )}
            {viewMode === 'list' && (
              <div className="flex flex-col gap-4">
                {notes.map((note, index) => (
                  <div key={index} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group">
                    <div className="flex flex-col">
                      <div className="mb-4">
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
    </div>
  )
} 