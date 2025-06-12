import { createContext, useContext, useState } from 'react'

const TitlebarContext = createContext<TitlebarContextProps | undefined>(undefined)

export const TitlebarContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeMenuIndex, setActiveMenuIndex] = useState<number | null>(null)
  const [menusVisible, setMenusVisible] = useState(false)
  const closeActiveMenu = () => setActiveMenuIndex(null)

  return (
    <TitlebarContext.Provider
      value={{ activeMenuIndex, setActiveMenuIndex, menusVisible, setMenusVisible, closeActiveMenu }}
    >
      {children}
    </TitlebarContext.Provider>
  )
}

export const useTitlebarContext = () => {
  const context = useContext(TitlebarContext)
  if (context === undefined) {
    throw new Error('useTitlebarContext must be used within a TitlebarContext')
  }
  return context
}

interface TitlebarContextProps {
  activeMenuIndex: number | null
  menusVisible: boolean
  setActiveMenuIndex: (index: number | null) => void
  setMenusVisible: (visible: boolean) => void
  closeActiveMenu: () => void
}
