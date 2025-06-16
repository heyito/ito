import { Grid, BookOpen, FileText } from '@mynaui/icons-react';
import { ItoIcon } from '../icons/ItoIcon';
import { useMainStore } from '@/app/store/useMainStore';
import { useEffect, useState } from 'react';
import { NavItem } from './elements/NavItem';
import HomeContent from './contents/HomeContent';

export default function HomeKit() {
  const {navExpanded} = useMainStore()
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

  return (
    <div className="flex h-full bg-slate-50">
      {/* Sidebar */}
      <div className={`${navExpanded ? 'w-64' : 'w-20'} flex flex-col justify-between py-2 px-4 transition-all duration-100 ease-in-out`}>
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
              isActive={true}
              showText={showText}
            />
            <NavItem 
              icon={<BookOpen className="w-5 h-5" />}
              label="Dictionary"
              showText={showText}
            />
            <NavItem 
              icon={<FileText className="w-5 h-5" />}
              label="Notes"
              showText={showText}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col w-full items-center bg-white rounded-lg m-2 ml-0 mt-0 border border-neutral-200 pt-8 px-36">
        <HomeContent />
      </div>
    </div>
  );
}
