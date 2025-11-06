import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { KeyState } from './keyboard'
import type { KeyEvent } from '@/lib/preload'

// Mock the window.api for KeyState tests
const mockApi = {
  blockKeys: mock(),
}

global.window = {
  api: mockApi as any,
} as any

beforeEach(() => {
  mockApi.blockKeys.mockClear()
})

describe('KeyState', () => {
  let keyState: KeyState

  beforeEach(() => {
    keyState = new KeyState()
  })

  describe('constructor', () => {
    test('should initialize with empty shortcut by default', () => {
      const state = new KeyState()
      expect(state.getPressedKeys()).toEqual([])
    })

    test('should initialize with provided shortcut', () => {
      const keyState = new KeyState(['command', 'space'])

      expect(keyState).toBeDefined()
    })
  })

  describe('updateShortcut', () => {
    test('should update the shortcut', () => {
      keyState.updateShortcut(['command', 'z'])

      expect(keyState).toBeDefined()
    })

    test('should handle empty shortcut', () => {
      keyState.updateShortcut([])

      expect(keyState).toBeDefined()
    })
  })

  describe('update', () => {
    test('should track keydown events', () => {
      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      expect(keyState.getPressedKeys()).toContain('a')
      expect(keyState.isKeyPressed('a')).toBe(true)
    })

    test('should track keyup events', () => {
      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      keyState.update({ key: 'KeyA', type: 'keyup' } as KeyEvent)
      expect(keyState.getPressedKeys()).not.toContain('a')
      expect(keyState.isKeyPressed('a')).toBe(false)
    })

    test('should ignore fn_fast events', () => {
      keyState.update({ key: 'Unknown(179)', type: 'keydown' } as KeyEvent)
      expect(keyState.getPressedKeys()).toEqual([])
    })

    test('should track multiple keys', () => {
      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      keyState.update({ key: 'KeyB', type: 'keydown' } as KeyEvent)
      expect(keyState.getPressedKeys()).toContain('a')
      expect(keyState.getPressedKeys()).toContain('b')
      expect(keyState.getPressedKeys()).toHaveLength(2)
    })
  })

  describe('getPressedKeys', () => {
    test('should return empty array initially', () => {
      expect(keyState.getPressedKeys()).toEqual([])
    })

    test('should return currently pressed keys', () => {
      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      keyState.update({ key: 'Space', type: 'keydown' } as KeyEvent)
      const pressed = keyState.getPressedKeys()
      expect(pressed).toContain('a')
      expect(pressed).toContain('space')
      expect(pressed).toHaveLength(2)
    })
  })

  describe('isKeyPressed', () => {
    test('should return false for unpressed keys', () => {
      expect(keyState.isKeyPressed('a')).toBe(false)
    })

    test('should return true for pressed keys', () => {
      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      expect(keyState.isKeyPressed('a')).toBe(true)
    })
  })

  describe('clear', () => {
    test('should clear all pressed keys', () => {
      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      keyState.update({ key: 'KeyB', type: 'keydown' } as KeyEvent)
      keyState.clear()
      expect(keyState.getPressedKeys()).toEqual([])
      expect(keyState.isKeyPressed('a')).toBe(false)
      expect(keyState.isKeyPressed('b')).toBe(false)
    })

    test('should clear all pressed keys', () => {
      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      keyState.clear()
      expect(keyState.getPressedKeys()).toHaveLength(0)
    })
  })

  describe('key blocking behavior', () => {
    test('should track non-shortcut keys correctly', () => {
      keyState.updateShortcut(['command', 'z'])

      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      expect(keyState.getPressedKeys()).toContain('a')
    })

    test('should track keys when part of shortcut is pressed', () => {
      keyState.updateShortcut(['command', 'z'])

      keyState.update({ key: 'MetaLeft', type: 'keydown' } as KeyEvent)
      expect(keyState.isKeyPressed('command-left')).toBe(true)
      expect(keyState.getPressedKeys()).toContain('command-left')
    })

    test('should track keys when complete shortcut is pressed', () => {
      keyState.updateShortcut(['command', 'z'])

      keyState.update({ key: 'MetaLeft', type: 'keydown' } as KeyEvent)
      keyState.update({ key: 'KeyZ', type: 'keydown' } as KeyEvent)
      expect(keyState.isKeyPressed('command-left')).toBe(true)
      expect(keyState.isKeyPressed('z')).toBe(true)
    })

    test('should track key releases correctly', () => {
      keyState.updateShortcut(['command', 'z'])
      keyState.update({ key: 'MetaLeft', type: 'keydown' } as KeyEvent)

      keyState.update({ key: 'MetaLeft', type: 'keyup' } as KeyEvent)
      expect(keyState.isKeyPressed('command-left')).toBe(false)
    })

    test('should handle complex shortcuts with multiple modifier keys', () => {
      keyState.updateShortcut(['command', 'shift', 'z'])

      keyState.update({ key: 'MetaLeft', type: 'keydown' } as KeyEvent)
      keyState.update({ key: 'ShiftLeft', type: 'keydown' } as KeyEvent)

      expect(keyState.isKeyPressed('command-left')).toBe(true)
      expect(keyState.isKeyPressed('shift-left')).toBe(true)
    })

    test('should handle fn key in shortcuts', () => {
      keyState.updateShortcut(['fn', 'f1'])

      keyState.update({ key: 'Function', type: 'keydown' } as KeyEvent)

      // Should track fn key presses
      expect(keyState.isKeyPressed('fn')).toBe(true)
    })

    test('should track command keys correctly', () => {
      keyState.updateShortcut(['command'])

      keyState.update({ key: 'MetaLeft', type: 'keydown' } as KeyEvent)

      // Should track the command key (as command-left)
      expect(keyState.isKeyPressed('command-left')).toBe(true)
      expect(keyState.getPressedKeys()).toContain('command-left')
    })
  })

  describe('edge cases', () => {
    test('should handle same key pressed multiple times', () => {
      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      expect(keyState.getPressedKeys()).toEqual(['a'])
    })

    test('should handle keyup for unpressed key', () => {
      keyState.update({ key: 'KeyA', type: 'keyup' } as KeyEvent)
      expect(keyState.getPressedKeys()).toEqual([])
    })

    test('should handle shortcut change while keys are pressed', () => {
      keyState.updateShortcut(['command', 'z'])
      keyState.update({ key: 'MetaLeft', type: 'keydown' } as KeyEvent)

      // Change shortcut while command is still pressed
      keyState.updateShortcut(['command', 'x'])

      // KeyState should still track the pressed key correctly
      expect(keyState.isKeyPressed('command-left')).toBe(true)
    })
  })
})
