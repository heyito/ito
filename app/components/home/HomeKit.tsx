import { Grid, BookOpen, FileText } from '@mynaui/icons-react';
import { ItoIcon } from '../icons/ItoIcon';
import { useMainStore } from '@/app/store/useMainStore';
import { useEffect, useState } from 'react';
import { NavItem } from '../ui/nav-item';
import HomeContent from './contents/HomeContent';
import DictionaryContent from './contents/DictionaryContent';
import NotesContent from './contents/NotesContent';

export default function HomeKit() {
  const { navExpanded, currentPage, setCurrentPage } = useMainStore()
  const [showText, setShowText] = useState(navExpanded)

  // Handle text and positioning animation timing
  useEffect(() => {
    if (navExpanded) {
      // When expanding: slide right first, then show text
      const timer = setTimeout(() => {
        setShowText(true) // Show text after slide starts
      }, 75)
      return () => clearTimeout(timer)
    } else {
      // When collapsing: hide text immediately, then center icons after slide completes
      setShowText(false)
      // Return no-op function
      return () => {}
    }
  }, [navExpanded])

  // Render the appropriate content based on current page
  const renderContent = () => {
    switch (currentPage) {
      case 'home':
        return <HomeContent />
      case 'dictionary':
        return <DictionaryContent />
      case 'notes':
        return <NotesContent />
      default:
        return <HomeContent />
    }
  }

  return (
    <div className="flex h-full bg-slate-50">
      {/* Sidebar */}
      <div className={`${navExpanded ? 'w-64' : 'w-20'} flex flex-col justify-between py-4 px-4 transition-all duration-100 ease-in-out`}>
        <div>
          {/* Logo and Plan */}
          <div className="flex items-center mb-10 px-3">
            <ItoIcon className="w-6 text-gray-900" style={{ height: '32px' }} />
            <span className={`text-2xl font-bold transition-opacity duration-100 ${showText ? 'opacity-100' : 'opacity-0'} ${showText ? 'ml-2' : 'w-0 overflow-hidden'}`}>
              Ito
            </span>
          </div>
          {/* Nav */}
          <div className="flex flex-col gap-1 text-sm">
            <NavItem 
              icon={<Grid className="w-5 h-5" />}
              label="Home"
              isActive={currentPage === 'home'}
              showText={showText}
              onClick={() => setCurrentPage('home')}
            />
            <NavItem 
              icon={<BookOpen className="w-5 h-5" />}
              label="Dictionary"
              isActive={currentPage === 'dictionary'}
              showText={showText}
              onClick={() => setCurrentPage('dictionary')}
            />
            <NavItem 
              icon={<FileText className="w-5 h-5" />}
              label="Notes"
              isActive={currentPage === 'notes'}
              showText={showText}
              onClick={() => setCurrentPage('notes')}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col w-full items-center bg-white rounded-lg m-2 ml-0 mt-0 border border-neutral-200 pt-12">
        {renderContent()}
      </div>
    </div>
  );
}
