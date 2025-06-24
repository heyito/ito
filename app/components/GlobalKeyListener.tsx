import { useGlobalShortcut } from '@/app/hooks/useGlobalShortcut'

/**
 * This component activates the global keyboard shortcut listener for the application.
 * It does not render any UI.
 */
export default function GlobalKeyListener() {
  useGlobalShortcut()
  return null
}
