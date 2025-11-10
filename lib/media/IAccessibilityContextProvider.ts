import type {
  CursorContextOptions,
  CursorContextResult,
} from '../types/cursorContext'

export interface IAccessibilityContextProvider {
  initialize(): void

  shutdown(): void

  isRunning(): boolean

  getCursorContext(options?: CursorContextOptions): Promise<CursorContextResult>
}
