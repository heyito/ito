import traceback
import threading
import time
from typing import Optional

from pynput import keyboard
from PySide6.QtCore import QObject, Signal


class KeyboardManager(QObject):
    # Singleton instance
    _instance = None

    # Signal when hotkey is pressed
    hotkey_pressed = Signal(str)
    # Signal when hotkey is released
    hotkey_released = Signal(str)
    # Signal when listener status changes
    listener_status_changed = Signal(bool, str)

    @classmethod
    def instance(cls):
        if cls._instance is None:
            cls._instance = KeyboardManager()
        return cls._instance

    def __init__(self):
        if KeyboardManager._instance is not None:
            raise Exception(
                "KeyboardManager is a singleton! Use KeyboardManager.instance()"
            )
        super().__init__()
        self._listener: Optional[keyboard.Listener] = None
        self._target_hotkey = None
        self._hotkey_str = None
        self._listener_started = False
        self._tap = None
        self.pressed_keys = set()
        self._was_hotkey_pressed = False
        self._listener_thread: Optional[threading.Thread] = None
        self._monitor_thread: Optional[threading.Thread] = None
        self._should_monitor = True

        # self._is_macos = platform.system() == 'Darwin'
        self._is_macos = False

    def check_hotkey_match(self) -> bool:
        """
        Check if the currently pressed keys match the target hotkey.
        Returns True if there's a match, False otherwise.
        """
        if not self._target_hotkey:
            return False

        # Get symbols for currently pressed keys
        current_keys = set(self.get_pressed_keys())
        return current_keys == self._target_hotkey

    def set_hotkey(self, hotkey_str: str) -> bool:
        """Set the target hotkey without restarting the listener.
        hotkey_str should be in the format 'key1+key2+key3' where each key is in symbolic form.
        Example: '⌘+⇧+a' or 'ctrl+shift+a'
        """
        try:
            # Store the symbolic string
            self._hotkey_str = hotkey_str

            # Convert to set of key symbols for comparison
            self._target_hotkey = set(hotkey_str.split("+"))

            print(f"Hotkey updated to: {hotkey_str}")
            return True

        except Exception as e:
            print(f"Failed to set hotkey: {e}")
            traceback.print_exc()
            return False

    def get_key_symbol(self, key):
        """
        Helper function to get a symbolic representation of the key.
        Handles special keys by returning their name or a specific symbol (especially for macOS).
        For alphanumeric keys, returns the character.
        """
        # If key is already a string, return it
        if isinstance(key, str):
            return key

        try:
            # For alphanumeric keys, return the character
            if str(key) == "<63>":
                return "fn"
            return key.char
        except AttributeError:
            # For special keys (like Key.space, Key.shift, Key.esc, etc.)
            # Use macOS symbols for common modifier keys.
            if key == keyboard.Key.space:
                return "space"
            elif key == keyboard.Key.enter:
                return "enter"
            elif key == keyboard.Key.esc:
                return "esc"
            elif key == keyboard.Key.shift or key == keyboard.Key.shift_r:
                return "⇧"  # Shift symbol
            elif key == keyboard.Key.ctrl or key == keyboard.Key.ctrl_r:
                return "^"  # Control symbol
            elif key == keyboard.Key.alt or key == keyboard.Key.alt_r:
                return "⌥"  # Option (Alt) symbol
            elif key == keyboard.Key.cmd or key == keyboard.Key.cmd_r:
                return "⌘"  # Command symbol (macOS)
            elif key == keyboard.Key.backspace:
                return "backspace"
            elif key == keyboard.Key.delete:
                return "delete"
            elif key == keyboard.Key.tab:
                return "tab"
            elif key == keyboard.Key.caps_lock:
                return "caps_lock"
            elif key == keyboard.Key.up:
                return "↑"
            elif key == keyboard.Key.down:
                return "↓"
            elif key == keyboard.Key.left:
                return "←"
            elif key == keyboard.Key.right:
                return "→"
            # Add more mappings for other special keys as needed
            else:
                # For other special keys (like F1-F12, page_up, home, etc.),
                # pynput's default representation is often sufficient.
                return str(key).replace("Key.", "")  # Remove 'Key.' prefix

    def _on_press(self, key):
        """
        Callback function for key press events.
        Adds the pressed key to the set and checks for hotkey match.
        """
        try:
            # Add the key object directly to the set
            self.pressed_keys.add(key)

            # Check if we have a hotkey match
            is_match = self.check_hotkey_match()

            # If we have a match and weren't previously pressed, emit the signal
            if is_match and not self._was_hotkey_pressed:
                self._was_hotkey_pressed = True
                self.hotkey_pressed.emit(self._hotkey_str)

        except Exception as e:
            print(f"Error in _on_press: {e}")
            traceback.print_exc()

    def _on_release(self, key):
        """
        Callback function for key release events.
        Handles special case for key 63 (Fn on macOS).
        """
        try:
            # Special handling for Fn key (keycode 63)
            if hasattr(key, "vk") and key.vk == 63:
                if key not in self.pressed_keys:
                    # First release event: treat as press
                    self.pressed_keys.add(key)
                    # Check for hotkey match after adding Fn
                    is_match = self.check_hotkey_match()
                    if is_match and not self._was_hotkey_pressed:
                        self._was_hotkey_pressed = True
                        self.hotkey_pressed.emit(self._hotkey_str)
                    return
                else:
                    # Second release event: treat as release
                    self.pressed_keys.remove(key)
                    # Check if we should emit release signal
                    if self._was_hotkey_pressed:
                        self._was_hotkey_pressed = False
                        self.hotkey_released.emit(self._hotkey_str)
                    return

            # Normal behavior for other keys
            if key in self.pressed_keys:
                self.pressed_keys.remove(key)
                # Check if we should emit release signal
                if self._was_hotkey_pressed and not self.check_hotkey_match():
                    self._was_hotkey_pressed = False
                    self.hotkey_released.emit(self._hotkey_str)

        except KeyError:
            pass
        except Exception as e:
            print(f"Error in _on_release: {e}")
            traceback.print_exc()

    def get_pressed_keys(self):
        """
        Returns a list of symbols for the currently pressed keys,
        up to a maximum of 3, in a consistent sorted order.
        """
        # Convert the set of key objects to their symbols
        key_symbols = [self.get_key_symbol(k) for k in self.pressed_keys]
        # Sort the symbols to ensure consistent order
        key_symbols.sort()
        # Return up to 3 keys
        return key_symbols[:3]
