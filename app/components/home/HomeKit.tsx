import {
  Home,
  BookOpen,
  FileText,
  CogFour,
  InfoCircle,
} from '@mynaui/icons-react'
import { ItoIcon } from '../icons/ItoIcon'
import { useMainStore } from '@/app/store/useMainStore'
import { useUserMetadataStore } from '@/app/store/useUserMetadataStore'
import { PaidStatus } from '@/lib/main/sqlite/models'
import { useEffect, useState } from 'react'
import { NavItem } from '../ui/nav-item'
import HomeContent from './contents/HomeContent'
import DictionaryContent from './contents/DictionaryContent'
import NotesContent from './contents/NotesContent'
import SettingsContent from './contents/SettingsContent'
import AboutContent from './contents/AboutContent'

export default function HomeKit() {
  const { navExpanded, currentPage, setCurrentPage } = useMainStore()
  const { metadata } = useUserMetadataStore()
  const [showText, setShowText] = useState(navExpanded)

  const isPro =
    metadata?.paid_status === PaidStatus.PRO ||
    metadata?.paid_status === PaidStatus.PRO_TRIAL

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
      case 'settings':
        return <SettingsContent />
      case 'about':
        return <AboutContent />
      default:
        return <HomeContent />
    }
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div
        className={`${navExpanded ? 'w-48' : 'w-20'} flex flex-col justify-between py-4 px-4 transition-all duration-100 ease-in-out border-r border-neutral-200`}
      >
        <div>
          {/* Logo and Plan */}
          <div className="flex items-center mb-10 px-3">
            <ItoIcon className="w-6 text-gray-900" style={{ height: '32px' }} />
            <span
              className={`text-2xl font-bold transition-opacity duration-100 ${showText ? 'opacity-100' : 'opacity-0'} ${showText ? 'ml-2' : 'w-0 overflow-hidden'}`}
            >
              ito
            </span>
            {isPro && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 text-white transition-opacity duration-100 ${showText ? 'opacity-100' : 'opacity-0'} ${showText ? 'ml-2' : 'w-0 overflow-hidden'}`}
              >
                PRO
              </span>
            )}
          </div>
          {/* Nav */}
          <div className="flex flex-col gap-1 text-sm">
            <NavItem
              icon={<Home className="w-5 h-5" />}
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
            <NavItem
              icon={<CogFour className="w-5 h-5" />}
              label="Settings"
              isActive={currentPage === 'settings'}
              showText={showText}
              onClick={() => setCurrentPage('settings')}
            />
            <NavItem
              icon={<InfoCircle className="w-5 h-5" />}
              label="About"
              isActive={currentPage === 'about'}
              showText={showText}
              onClick={() => setCurrentPage('about')}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 items-center bg-white rounded-lg m-2 ml-0 mt-0 pt-12">
        {renderContent()}
      </div>
    </div>
  )
}
