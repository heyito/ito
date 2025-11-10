/**
 * Cursor Context Types
 *
 * Defines types for retrieving text surrounding the cursor position
 * using accessibility APIs (NSAccessibility on macOS, UIAutomation on Windows)
 */

/**
 * Position of the cursor within a text field
 */
export interface CursorPosition {
  /** Character offset from start of text */
  offset: number
  /** Line number (0-indexed) */
  line?: number
  /** Column number (0-indexed) */
  column?: number
}

/**
 * Range of text within a text field
 */
export interface TextRange {
  /** Start position (character offset) */
  start: number
  /** End position (character offset) */
  end: number
  /** Length of the range */
  length: number
}

/**
 * Text content surrounding the cursor with metadata
 */
export interface CursorContext {
  /** Text before the cursor */
  textBefore: string
  /** Text after the cursor */
  textAfter: string
  /** Currently selected/highlighted text, if any */
  selectedText: string
  /** Current cursor position */
  cursorPosition: CursorPosition
  /** Selection range, if text is selected */
  selectionRange?: TextRange
  /** Whether the text was truncated due to length limits */
  truncated: boolean
  /** Total character count in the text field */
  totalLength: number
  /** Timestamp when context was captured */
  timestamp: string
}

/**
 * Complete cursor context result including success/error status
 */
export interface CursorContextResult {
  success: boolean
  context?: CursorContext
  error?: string
  /** Method used to retrieve context (for debugging/telemetry) */
  method: 'accessibility' | 'ocr' | 'clipboard' | 'keyboard'
}

/**
 * Options for retrieving cursor context
 */
export interface CursorContextOptions {
  /**
   * Maximum characters to retrieve before cursor
   */
  maxCharsBefore: number

  /**
   * Maximum characters to retrieve after cursor
   */
  maxCharsAfter: number

  /**
   * Timeout in milliseconds
   */
  timeout: number

  /**
   * Enable debug logging to stderr
   */
  debug: boolean
}
