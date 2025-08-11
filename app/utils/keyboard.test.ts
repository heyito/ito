import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { normalizeKeyEvent, KeyState } from './keyboard'
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

describe('normalizeKeyEvent', () => {
  test('should normalize modifier keys correctly', () => {
    expect(
      normalizeKeyEvent({ key: 'MetaLeft', type: 'keydown' } as KeyEvent),
    ).toBe('command')
    expect(
      normalizeKeyEvent({ key: 'MetaRight', type: 'keydown' } as KeyEvent),
    ).toBe('command')
    expect(
      normalizeKeyEvent({ key: 'ControlLeft', type: 'keydown' } as KeyEvent),
    ).toBe('control')
    expect(
      normalizeKeyEvent({ key: 'ControlRight', type: 'keydown' } as KeyEvent),
    ).toBe('control')
    expect(normalizeKeyEvent({ key: 'Alt', type: 'keydown' } as KeyEvent)).toBe(
      'option',
    )
    expect(
      normalizeKeyEvent({ key: 'AltGr', type: 'keydown' } as KeyEvent),
    ).toBe('option')
    expect(
      normalizeKeyEvent({ key: 'ShiftLeft', type: 'keydown' } as KeyEvent),
    ).toBe('shift')
    expect(
      normalizeKeyEvent({ key: 'ShiftRight', type: 'keydown' } as KeyEvent),
    ).toBe('shift')
  })

  test('should normalize letter keys correctly', () => {
    expect(
      normalizeKeyEvent({ key: 'KeyA', type: 'keydown' } as KeyEvent),
    ).toBe('a')
    expect(
      normalizeKeyEvent({ key: 'KeyZ', type: 'keydown' } as KeyEvent),
    ).toBe('z')
  })

  test('should normalize number keys correctly', () => {
    expect(
      normalizeKeyEvent({ key: 'Digit1', type: 'keydown' } as KeyEvent),
    ).toBe('1')
    expect(
      normalizeKeyEvent({ key: 'Digit0', type: 'keydown' } as KeyEvent),
    ).toBe('0')
  })

  test('should normalize special keys correctly', () => {
    expect(
      normalizeKeyEvent({ key: 'Space', type: 'keydown' } as KeyEvent),
    ).toBe('space')
    expect(
      normalizeKeyEvent({ key: 'Enter', type: 'keydown' } as KeyEvent),
    ).toBe('enter')
    expect(
      normalizeKeyEvent({ key: 'Escape', type: 'keydown' } as KeyEvent),
    ).toBe('esc')
    expect(
      normalizeKeyEvent({ key: 'Backspace', type: 'keydown' } as KeyEvent),
    ).toBe('backspace')
    expect(normalizeKeyEvent({ key: 'Tab', type: 'keydown' } as KeyEvent)).toBe(
      'tab',
    )
    expect(
      normalizeKeyEvent({ key: 'ArrowUp', type: 'keydown' } as KeyEvent),
    ).toBe('↑')
    expect(
      normalizeKeyEvent({ key: 'ArrowDown', type: 'keydown' } as KeyEvent),
    ).toBe('↓')
    expect(
      normalizeKeyEvent({ key: 'ArrowLeft', type: 'keydown' } as KeyEvent),
    ).toBe('←')
    expect(
      normalizeKeyEvent({ key: 'ArrowRight', type: 'keydown' } as KeyEvent),
    ).toBe('→')
  })

  test('should handle function key special case', () => {
    expect(
      normalizeKeyEvent({ key: 'Function', type: 'keydown' } as KeyEvent),
    ).toBe('fn')
    expect(
      normalizeKeyEvent({ key: 'Unknown(179)', type: 'keydown' } as KeyEvent),
    ).toBe('fn_fast')
  })

  test('should normalize unknown keys by cleaning up the name', () => {
    expect(
      normalizeKeyEvent({ key: 'SomeUnknownKey', type: 'keydown' } as KeyEvent),
    ).toBe('someunknownkey')
    expect(
      normalizeKeyEvent({ key: 'KeyCustom', type: 'keydown' } as KeyEvent),
    ).toBe('custom')
    expect(
      normalizeKeyEvent({ key: 'DigitCustom', type: 'keydown' } as KeyEvent),
    ).toBe('custom')
    expect(
      normalizeKeyEvent({ key: 'ArrowCustom', type: 'keydown' } as KeyEvent),
    ).toBe('custom')
  })

  test('should handle empty key gracefully', () => {
    expect(normalizeKeyEvent({ key: '', type: 'keydown' } as KeyEvent)).toBe(
      'unknown',
    )
  })
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
      expect(mockApi.blockKeys).toHaveBeenCalledWith([])
    })

    test('should initialize with provided shortcut', () => {
      new KeyState(['command', 'space'])
      expect(mockApi.blockKeys).toHaveBeenCalledWith(['command', 'space'])
    })
  })

  describe('updateShortcut', () => {
    test('should update the shortcut and call blockKeys', () => {
      keyState.updateShortcut(['command', 'z'])
      expect(mockApi.blockKeys).toHaveBeenCalledWith([])
    })

    test('should handle empty shortcut', () => {
      keyState.updateShortcut([])
      expect(mockApi.blockKeys).toHaveBeenCalledWith([])
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

    test('should call blockKeys with empty array after clearing', () => {
      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      keyState.clear()
      expect(mockApi.blockKeys).toHaveBeenCalledWith([])
    })
  })

  describe('key blocking behavior', () => {
    test('should not block keys when shortcut is not being pressed', () => {
      keyState.updateShortcut(['command', 'z'])

      keyState.update({ key: 'KeyA', type: 'keydown' } as KeyEvent)
      expect(mockApi.blockKeys).toHaveBeenCalledWith([])
    })

    test('should block keys when part of shortcut is pressed', () => {
      keyState.updateShortcut(['command', 'z'])

      keyState.update({ key: 'MetaLeft', type: 'keydown' } as KeyEvent)
      expect(mockApi.blockKeys).toHaveBeenCalledWith([
        'MetaLeft',
        'MetaRight',
        'KeyZ',
      ])
    })

    test('should block keys when complete shortcut is pressed', () => {
      keyState.updateShortcut(['command', 'z'])

      keyState.update({ key: 'MetaLeft', type: 'keydown' } as KeyEvent)
      keyState.update({ key: 'KeyZ', type: 'keydown' } as KeyEvent)
      expect(mockApi.blockKeys).toHaveBeenLastCalledWith([
        'MetaLeft',
        'MetaRight',
        'KeyZ',
      ])
    })

    test('should unblock keys when shortcut keys are released', () => {
      keyState.updateShortcut(['command', 'z'])
      keyState.update({ key: 'MetaLeft', type: 'keydown' } as KeyEvent)

      keyState.update({ key: 'MetaLeft', type: 'keyup' } as KeyEvent)
      expect(mockApi.blockKeys).toHaveBeenCalledWith([])
    })

    test('should handle complex shortcuts with multiple modifier keys', () => {
      keyState.updateShortcut(['command', 'shift', 'z'])

      keyState.update({ key: 'MetaLeft', type: 'keydown' } as KeyEvent)
      keyState.update({ key: 'ShiftLeft', type: 'keydown' } as KeyEvent)

      expect(mockApi.blockKeys).toHaveBeenLastCalledWith([
        'MetaLeft',
        'MetaRight',
        'ShiftLeft',
        'ShiftRight',
        'KeyZ',
      ])
    })

    test('should handle fn key in shortcuts', () => {
      keyState.updateShortcut(['fn', 'f1'])

      keyState.update({ key: 'Function', type: 'keydown' } as KeyEvent)

      // Should include the special "fast fn" key
      const lastCall =
        mockApi.blockKeys.mock.calls[mockApi.blockKeys.mock.calls.length - 1]
      expect(lastCall[0]).toContain('Function')
      expect(lastCall[0]).toContain('Unknown(179)')
    })

    test('should deduplicate blocked keys', () => {
      keyState.updateShortcut(['command'])

      keyState.update({ key: 'MetaLeft', type: 'keydown' } as KeyEvent)

      const blockedKeys =
        mockApi.blockKeys.mock.calls[mockApi.blockKeys.mock.calls.length - 1][0]
      const uniqueKeys = [...new Set(blockedKeys)]
      expect(blockedKeys).toEqual(uniqueKeys)
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

      // Should update blocking based on new shortcut
      expect(mockApi.blockKeys).toHaveBeenLastCalledWith([
        'MetaLeft',
        'MetaRight',
        'KeyX',
      ])
    })
  })
})
