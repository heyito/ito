import type {
  CursorContextOptions,
  CursorContextResult,
} from '../types/cursorContext'

export interface ICursorContextService {
  getCursorContext(options?: CursorContextOptions): Promise<CursorContextResult>
}
