import { Button } from '@/app/components/ui/button'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';

const sources = [
  'Twitter',
  'Youtube',
  'Reddit',
  'Friend',
  'Google Search',
  'Product Hunt',
  'Other',
]

export default function SignupContent() {
  const [source, setSource] = useState('')

  return (
    <div className="flex flex-col h-full min-h-[400px] justify-between py-12">
      <div className="mt-36">
        <h1 className="text-3xl mb-4">Welcome!</h1>
        <p className="mb-6 text-base text-muted-foreground">Where did you hear about us?</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="mb-8 w-48 px-4 py-2 border border-border rounded-md bg-background text-base focus:outline-none text-left flex items-center justify-between">
              {source ? <span className="text-sm">{source}</span> : <span className="text-muted-foreground text-sm">Select a source</span>}
              <svg className="ml-2 h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 text-sm border-border">
            {sources.map(s => (
              <DropdownMenuItem key={s} onSelect={() => setSource(s)}>{s}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col items-start mt-64 mb-4">
        <Button className="w-24" disabled={!source}>Continue</Button>
      </div>
    </div>
  )
} 