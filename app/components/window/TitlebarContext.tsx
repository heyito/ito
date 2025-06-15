import { createContext, useContext } from 'react'

const TitlebarContext = createContext<TitlebarContextProps | undefined>(undefined)

export const TitlebarContextProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <TitlebarContext.Provider value={{}}>
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface TitlebarContextProps { }
