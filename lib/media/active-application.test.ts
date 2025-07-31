import { describe, expect, mock, test } from 'bun:test'
import { getActiveWindow } from './active-application'

const windowTitle = 'Mocked Active Window'

mock.module('get-windows', () => {
  return {
    activeWindow: async () => ({
      title: windowTitle,
    }),
  }
})

describe('active-application', () => {
  test('should return the active window info', async () => {
    // TODO
  })
})
