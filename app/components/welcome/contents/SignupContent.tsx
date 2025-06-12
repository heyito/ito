import { Button } from '@/app/components/ui/button'
import { useState } from 'react'

const sources = [
  'Google',
  'Twitter',
  'Friend',
  'Other',
]

export default function SignupContent() {
  const [source, setSource] = useState('')

  return (
    <div className="flex flex-col justify-center h-full min-h-[400px]">
      <h1 className="text-3xl font-semibold mb-2">Welcome, <span className="font-normal">!</span></h1>
      <p className="mb-6 text-base text-muted-foreground">Where did you hear about us?</p>
      <select
        className="mb-8 w-60 px-4 py-2 border border-border rounded-md bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary"
        value={source}
        onChange={e => setSource(e.target.value)}
      >
        <option value="" disabled>Select a source</option>
        {sources.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <Button className="w-32" disabled={!source}>Continue</Button>
    </div>
  )
} 