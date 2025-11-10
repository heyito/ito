/**
 * Accessibility Context Provider Interface
 *
 * Provider for accessibility API-based cursor context retrieval.
 * Manages a long-running native process that uses platform accessibility APIs:
 * - macOS: NSAccessibility/AXUIElement APIs
 * - Windows: UIAutomation APIs
 *
 * Communicates via JSON-RPC style messages over stdin/stdout.
 *
 * @see /native/cursor-context for Rust implementation
 */

import type {
  CursorContextOptions,
  CursorContextResult,
} from '../types/cursorContext'

export interface IAccessibilityContextProvider {
  /**
   * Initialize the provider and start the native process
   *
   * @throws Error if binary path cannot be resolved or process fails to start
   */
  initialize(): void

  /**
   * Shutdown the provider and stop the native process
   */
  shutdown(): void

  /**
   * Check if the provider is currently running and responsive
   *
   * @returns true if the native process is active and responding to heartbeats
   */
  isRunning(): boolean

  /**
   * Get cursor context using accessibility APIs
   *
   * Sends a request to the native process to query the accessibility tree
   * for the focused text element and retrieve surrounding text.
   *
   * @param options - Options for retrieving context
   * @returns Promise that resolves with cursor context result
   * @throws Error if request times out or process is not running
   */
  getCursorContext(options?: CursorContextOptions): Promise<CursorContextResult>
}
