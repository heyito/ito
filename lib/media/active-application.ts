import { activeWindow, BaseResult } from 'get-windows'

export async function getActiveWindowName() {
  const result = (await activeWindow()) as BaseResult
  return result.title
}
