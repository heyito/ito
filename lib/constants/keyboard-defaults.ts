import { ItoMode } from '@/app/generated/ito_pb'

export const ITO_MODE_SHORTCUT_DEFAULTS = {
  [ItoMode.TRANSCRIBE]: ['fn'],
  [ItoMode.EDIT]: ['control-left', 'fn'],
}
