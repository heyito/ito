import logging
import traceback

from pynput import keyboard
from PySide6.QtCore import QObject, QTimer, Signal

from src.types.modes import CommandMode

# Configure logger
logger = logging.getLogger(__name__)


class KeyboardManager(QObject):
    # Singleton instance
    _instance = None

    # Signal when hotkey is pressed
    hotkey_pressed = Signal(CommandMode)
    # Signal when hotkey is released
    hotkey_released = Signal(CommandMode)
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
        self._event_queue = None
        self._status_queue = None
        self._listener: keyboard.Listener | None = None
        self._target_hotkeys: dict[CommandMode, set] = None
        self._hotkey_strs: dict[CommandMode, str] = None
        self._listener_thread = None
        self._listener_started = False
        self._tap = None
        self.pressed_keys = set()
        self._was_hotkey_pressed = False
        self._is_macos = False
        self._process_timer = None
        self.pressed_keys = set()

    def check_hotkey_match(self) -> bool:
        """
        Check if the currently pressed keys match the target hotkey.
        Returns the command mode of the hotkey if matched,
        otherwise returns None.
        """
        if not self._target_hotkeys:
            return False

        # Get symbols for currently pressed keys
        current_keys = set(self.get_pressed_keys())
        for mode, hotkey in self._target_hotkeys.items():
            if current_keys == hotkey:
                return mode

        return None

    def initialize(self, event_queue, status_queue) -> bool:
        logger.info("Initializing keyboard listener")
        """Initialize the keyboard listener once. This should only be called once when the application starts."""
        if self._listener_started:
            logger.info("Keyboard listener already initialized")
            return True

        try:
            self._event_queue = event_queue
            self._status_queue = status_queue

            # Start a timer to check for events from the process
            self._process_timer = QTimer()
            self._process_timer.timeout.connect(self._check_process_events)
            self._process_timer.start(50)  # Check every 50ms

            logger.info("Keyboard manager initialized successfully")
            self.listener_status_changed.emit(True, "Manager initialized successfully")
            return True
        except Exception as e:
            error_msg = f"Failed to initialize keyboard manager: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            self.listener_status_changed.emit(False, error_msg)
            return False

    def _check_process_events(self):
        """Check for events from the keyboard listener process"""
        try:
            # Check status queue
            while not self._status_queue.empty():
                status, message = self._status_queue.get_nowait()
                self.listener_status_changed.emit(status, message)

            # Check event queue
            while not self._event_queue.empty():
                event_type, key = self._event_queue.get_nowait()
                if event_type == "press":
                    self._on_press(key)
                elif event_type == "release":
                    self._on_release(key)

        except Exception as e:
            logger.error(f"Error checking process events: {e}")

    def set_hotkeys(self, hotkeys: dict[CommandMode, str]) -> bool:
        """Set the target hotkeys without restarting the listener.
        hotkey strings should be in the format 'key1+key2+key3' where each key is in symbolic form.
        Example: '⌘+⇧+a' or 'ctrl+shift+a'
        """
        try:
            # Store the symbolic strings
            self._hotkey_strs = hotkeys

            # Convert to set of key symbols for comparison
            target_hotkeys = {}
            for mode, hotkey_str in hotkeys.items():
                target_key = set(hotkey_str.split("+"))
                target_hotkeys[mode] = target_key
                logger.info(f"Hotkey updated to: {hotkey_str}")

            self._target_hotkeys = target_hotkeys

            return True

        except Exception as e:
            logger.error(f"Failed to set hotkey: {e}")
            logger.error(traceback.format_exc())
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
            mode_match = self.check_hotkey_match()

            # If we have a match and weren't previously pressed, emit the signal
            if mode_match and not self._was_hotkey_pressed:
                self._was_hotkey_pressed = True
                self._active_mode = mode_match
                self.hotkey_pressed.emit(mode_match)

        except Exception as e:
            error_msg = f"Error in _on_press: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            self.listener_status_changed.emit(False, error_msg)

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
                    mode_match = self.check_hotkey_match()
                    if mode_match and not self._was_hotkey_pressed:
                        self._was_hotkey_pressed = True
                        self.hotkey_pressed.emit(mode_match)
                    return
                else:
                    # Second release event: treat as release
                    self.pressed_keys.remove(key)
                    # Check if we should emit release signal
                    if self._was_hotkey_pressed:
                        self._was_hotkey_pressed = False
                        self.hotkey_released.emit(self._active_mode)
                        self._active_mode = None
                    return

            # Normal behavior for other keys
            if key in self.pressed_keys:
                self.pressed_keys.remove(key)
                # Check if we should emit release signal
                mode_match = self.check_hotkey_match()
                if self._was_hotkey_pressed and not mode_match:
                    self._was_hotkey_pressed = False
                    self.hotkey_released.emit(self._active_mode)
                    self._active_mode = None

        except KeyError:
            pass
        except Exception as e:
            error_msg = f"Error in _on_release: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            self.listener_status_changed.emit(False, error_msg)

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

    def cleanup(self):
        """Clean up the keyboard manager. Should only be called when the application is closing."""
        if self._process_timer:
            self._process_timer.stop()
            self._process_timer = None

        self._event_queue = None
        self._status_queue = None
        self._listener_started = False
        self._target_hotkeys = {}
        self._hotkey_strs = {}
        self._active_mode = None
        self._was_hotkey_pressed = False
        logger.info("Keyboard manager cleaned up")
        self.listener_status_changed.emit(False, "Manager cleaned up")
